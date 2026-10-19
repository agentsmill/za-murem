# Wydarzenia z prawdziwymi ludźmi: plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karty zarządu mówią tylko o ludziach, którzy są na mapie: goście z klocków chodzą pod bramę, mieszkańcy z generatora są bohaterami kart, wybory zmieniają to, co widać, a gra pamięta ludzi i układa łańcuchy historii.

**Architecture:** Zarząd (`src/gov`) składa i planuje, symulacja (`src/sim`) odgrywa pionkami, most to `src/sim/gov.ts` (`GovInput` w jedną stronę, `GovEffects` w drugą), jak dziś przy napadzie. Nowe moduły zarządu: `goscie.ts` (klocki), `znajomi.ts` (pamięć), `watki.ts` (łańcuchy i wątki sezonu), `narrator.ts` (napięcie). Symulacja dostaje rodzaje pionków `gosc`, `pies`, `kot`, przejście mieszkańca do zarządu i wyjście bramą.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`, importy z `.ts`), Vitest, Biome, PixiJS 8 (tylko warstwy rysowania), Playwright przez `npm run shots`.

**Spec:** `docs/superpowers/specs/2026-10-19-wydarzenia-design.md` (czytać razem z tym planem). Ocena: `docs/OCENA-wydarzenia.md`.

## Global Constraints

- Gałąź `wydarzenia` od `pelna-gra`, drzewo `.claude/worktrees/wydarzenia`. Commity lokalne po każdym zadaniu, nic nie wypychać.
- `src/gov` nie importuje `src/sim` i nie dotyka DOM (test w `tests/unit/zarzad.test.ts`).
- Losowanie: zarząd tylko ze swojego `st.rng` przez `rnd(st)`/`rngOf(st.rng)`, symulacja tylko ze `st.rng` symulacji albo z ziaren miejsca; bez `Math.random`, bez `Math.hypot`/`sin`/`cos` w decyzjach, tasowanie Fishera-Yatesa.
- Nowe pola stanu opcjonalne, powstają przy pierwszym użyciu albo `??=` bez losowania w konstruktorze `Sim`; wersje zapisu bez zmian. Nowe `Tx` w stanie zarządu dopisane do `normalizujTeksty` (`src/gov/zarzad.ts`).
- Treść 0.3 w `src/content/events.ts` bajt w bajt; zmiany w nakładkach `src/gov/warianty.ts`.
- Każdy napis gracza w obu językach (`Tx`, `tx()`), angielski według `docs/SLOWNICZEK-EN.md` (deski „planks”, szwendacz „shambler”, lokatorzy „residents”, klatka „stairwell”, leki „meds”, drewno „wood”), słowa miejsca przez `h.words()`/`h.wordsEn()`. Bez numerów mieszkań i pięter. Komentarze i nazwy po polsku, nagłówek pliku z kontraktem.
- Goście chodzą tylko z `SimOpts.obcy` (pole `GovInput.goscie` obecne tylko wtedy). Boty bez `obcy` nie mają gości.
- Bramka zadania: `npm test -- <pliki zadania>`, `npx biome check src tests tools index.html`. Bramka etapu (ostatnie zadanie etapu): pełne `npm test`, `npm run build`, `npm run bot`, `npm run bot:zombie`, zrzuty scenariuszy etapu obejrzane.

## Review Focus

- Zapis i wczytanie w środku wizyty gościa (gość w drodze, pod bramą z otwartą kartą, w środku nocą, w trakcie kradzieży): po wczytaniu ten sam przebieg i ta sama karta. Test w zadaniu 10.
- Karta gościa otwarta, a gość ucieka (szwendacz, w trybie zombie) albo ginie, zanim gracz wybierze: wybór nie może sterować pionkiem, którego nie ma; karta zamyka się z linią w kronice. Test w zadaniu 10.
- Stary zapis bez nowych pól (`goscie`, `znajomi`, `watki`, `napiecie`, flaga `cat`, rodzaje pionków) wczytuje się i gra dalej. Test w zadaniach 9, 14 i 15.
- Zmiana języka przy otwartej karcie gościa, złapanego złodzieja i kroku łańcucha: tekst w drugim języku bez polskich słów. Test w zadaniu 8 i 16.
- Gra bez generatora mieszkańców (brak tabel, własna drużyna, `?handlarz=0`): karty działają jak dziś, bez wyjątków. Test w zadaniach 4 i 6.

---

## Etap 1: karty, które kłamią

### Task 1: Pule według trybu i wyłączone karty bez ludzi

**Files:**
- Modify: `src/gov/tresc.ts` (`GEventDef`: pole `tryby`; nowe wydarzenie `slady_z`)
- Modify: `src/gov/warianty.ts` (`OldEvent`: pole `tryby`; nakładki `handlarz`, `czynsz`, `krypto`, `aktywisci`, `influencer`, `obserwacja`, `uchodzcy`)
- Modify: `src/gov/wydarzenia.ts` (`fitsMode`, scalanie nakładek)
- Test: `tests/unit/wydarzenia-tryby.test.ts`

**Interfaces:**
- Produces: `GEventDef.tryby?: readonly GameMode[]`, `OldEvent.tryby?: readonly GameMode[]`; `fitsMode(st: Pick<GovState, 'mode'>, e: Pick<GEventDef, 'id' | 'tryby'>): boolean` (zmiana sygnatury z `id: string` na definicję; poprawić wywołania).

- [ ] **Step 1: Write the failing tests**

```ts
it('w trybie zombie pula nie ma kart zwykłego trybu', () => {
  for (const id of ['handlarz', 'czynsz', 'krypto', 'aktywisci', 'influencer', 'obserwacja', 'uchodzcy', 'slady'])
    expect(fitsMode({ mode: 'zombie' }, M1_EVENTS.find((e) => e.id === id)!)).toBe(false);
});
it('slady_z jest tylko w trybie zombie i nie podbija napadu', () => { /* host z atrapy, każdy wybór: st.tonight.boost bez zmian */ });
it('handlarz i wedrowiec mają wagę 0 w obu trybach', () => { /* w(h) === 0 dla trybów 'zwykly' i 'zombie', dzień 2–5 */ });
it('spis 200 kart z gov-atrapa w trybie zombie nie zawiera wykluczonych', () => { /* run(seed, policy, 5 dni) dla 5 ziaren */ });
```

- [ ] **Step 2: Run** `npm test -- wydarzenia-tryby`: Expected: FAIL (brak pola `tryby`, `slady_z`).
- [ ] **Step 3: Implement.** Domyślnie `tryby` to oba tryby. `handlarz` i `wedrowiec` waga 0 (`wedrowiec` wraca w zadaniu 10 jako `gosc`). `slady_z` (`when: ['dzien','wieczor']`, `tryby: ['zombie']`, warunek jak `slady`): „Przy dziurze … szwendacze wydeptali ścieżkę w błocie”, wybory „Załatać przed nocą (Złom 2)” jak w `slady` i „Postawić tam kogoś z dzidą na noc” (`guardBonus(1)`). Teksty po angielsku obok.
- [ ] **Step 4: Run** `npm test -- wydarzenia-tryby zarzad styk-m2-zombie wydarzenia-miejsce`: Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Wydarzenia: pule według trybu, bez karty handlarza i wędrowca bez ludzi"`

### Task 2: Szwendacz w siatce z „Pokaż”

**Files:**
- Modify: `src/sim/gov.ts` (`govInput`: `horde.przy`; `applyGov`: `fx.atak`)
- Modify: `src/gov/typy.ts` (`GovInput.horde.przy`, `GovEffects.atak`, `Prompt` wydarzenia z `gdzie`)
- Modify: `src/gov/tresc.ts` (`GEventDef.gdzie`, wydarzenie `szwendacz`), `src/gov/wydarzenia.ts` (`eventView` zwraca `gdzie`)
- Test: `tests/unit/szwendacz-karta.test.ts`

**Interfaces:**
- Produces: `GovInput.horde.przy?: { pawn: number; x: number; y: number }` (najbliższy siatki szwendacz w promieniu 3 m od kafelka siatki, w kafelkach), `GovEffects.atak?: { id: string; pawn: number }[]` (osoba zarządu atakuje pionek: `applyGov` wstawia polecenie `{ t: 'attack', ids: [pionek osoby], target: pawn }`), `GEventDef.gdzie?: (h: GovHost, d: D) => { x: number; y: number } | null`, `Prompt` `wydarzenie` z polem `gdzie?: { x: number; y: number }`, `GovHost.przy(): { pawn; x; y } | null`, `GovHost.zDzida(): GovPerson | null` (nie śpi, nie na wyprawie, `arm === 'dzida'`).

- [ ] **Step 1: Write the failing tests**

```ts
it('govInput w trybie zombie podaje szwendacza przy siatce', () => { /* createSim zombie, spawnZombie przy siatce, govInput(...).horde.przy.pawn === id */ });
it('karta szwendacz wypada tylko za dnia z kimś przy siatce i ma gdzie', () => { /* eventView(...).gdzie równe {x,y} z przy */ });
it('Dobić dzidą wysyła atak osoby z dzidą na tego szwendacza', () => { /* fx.atak = [{id, pawn}] i po applyGov st.cmds zawiera attack */ });
it('bez dzidy wybór Dobić jest niedostępny', () => {});
```

- [ ] **Step 2: Run** `npm test -- szwendacz-karta`: Expected: FAIL.
- [ ] **Step 3: Implement.** Karta `szwendacz`: `tryby: ['zombie']`, `when: ['dzien']`, `gap: 6`, waga 1,2, gdy `przy()`. Wybory: „Dobić dzidą” (`ok: !!zDzida()`, `fx.atak`), „Zostawić, niech wisi” (`needsAll({ safe: -3 })`), „Zasłonić kocem, żeby dzieci nie patrzyły” (`mood(1, 0)`).
- [ ] **Step 4: Run** `npm test -- szwendacz-karta applygov zarzad-zombie`: Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Wydarzenia: szwendacz w siatce z miejscem na mapie"`

### Task 3: Przyjęci do zarządu wchodzą bramą i „Pokaż” na karcie

**Files:**
- Modify: `src/sim/sim.ts` (`addCore`)
- Modify: `src/sim/gov.ts` (`applyGov`: `addCore(…, true)`)
- Modify: `src/ui/przybycie.ts` (`arriving` liczy też zarząd w pracy `arrive`)
- Modify: `src/ui/okna.ts` (`eventSheet`: przycisk `event-show`), `src/main.ts` (`showPrompt`: `event-show` → `flyTo`, okno zostaje), `src/ui/jezyk.ts` (napis przycisku, jeśli trzeba)
- Test: `tests/unit/przyjecia.test.ts` (dopisać), `tests/unit/interfejs.test.ts` (dopisać)

**Interfaces:**
- Produces: `addCore(st: SimState, w: World, person: Person, arrive = false): Pawn` (z `arrive` pionek czeka na kafelku z `SPREAD` wokół `exitOf(w)` i ma pracę `{ t: 'arrive', target: -1, tile: kafelek przed drzwiami siedziby, until: st.tick }`, warstwa zarządu w czasie przyjścia jak u mieszkańców); `eventSheet` dodaje `btn('event-show', L('Pokaż', 'Show'), 'btn ghost')` przed wyborami, gdy `p.gdzie`.

- [ ] **Step 1: Write the failing tests**

```ts
it('fx.join: nowa osoba zarządu czeka za bramą i dochodzi do siedziby', () => { /* po applyGov pionek poza podwórkiem, job.t === 'arrive'; po 2 h gry pionek w budynku siedziby */ });
it('eventSheet z gdzie ma przycisk event-show, bez gdzie nie ma', () => {});
```

- [ ] **Step 2: Run** `npm test -- przyjecia interfejs`: Expected: FAIL.
- [ ] **Step 3: Implement** jak w Interfaces; w `main.ts` w obsłudze okna wydarzenia `act === 'event-show'` wywołuje `flyTo(p.gdzie.x * TILE, p.gdzie.y * TILE, view.cam.zoom, 900, 0)` i nie zamyka okna. Wpis kroniki przy pokazaniu karty (`show` w `wydarzenia.ts`) dostaje `gdzie` z karty: `GovState.log[].gdzie?: { x: number; y: number }` (na później, bez widoku).
- [ ] **Step 4: Run** `npm test -- przyjecia interfejs applygov`: Expected: PASS.
- [ ] **Step 5: Bramka etapu 1:** pełne `npm test`, `npm run build`, `npm run bot`, `npm run bot:zombie` (zmienione skróty zapisać z przyczyną), nowe scenariusze `wyd-szwendacz` (zombie, karta z „Pokaż”, po kliknięciu kamera przy szwendaczu) i `wyd-przyjety` (osoba zarządu idzie od bramy) w `tools/shots.ts`, `npm run shots -- wyd-`, zrzuty obejrzane.
- [ ] **Step 6: Commit** `git commit -m "Wydarzenia: przyjęci do zarządu wchodzą bramą, Pokaż na karcie"`

## Etap 2: mieszkańcy widoczni dla zarządu

### Task 4: Mieszkańcy z osobą w wejściu zarządu

**Files:**
- Modify: `src/gov/typy.ts` (`GovLokator`, `GovInput.lokatorzy`), `src/sim/gov.ts` (`govInput`), `src/gov/tresc.ts` (`GovHost`), `src/gov/wydarzenia.ts` (`makeHost`)
- Test: `tests/unit/lokatorzy-zarzad.test.ts`

**Interfaces:**
- Produces:

```ts
export interface GovLokator {
  pawn: number; id: string; name: string; first: string; f: boolean; age: number;
  prof: string; skills: Partial<Record<Dom, number>>; traits: string[];
  needs: GovNeeds; asleep: boolean; inside: boolean; tile: number;
}
// GovInput.lokatorzy?: GovLokator[] : tylko pionki 'resident' z person >= 0, w kolejności pionków
// GovHost.lokatorzy(): GovLokator[];  GovHost.lokator(id: string): GovLokator | null
```

- [ ] **Step 1: Write the failing tests:** `govInput z mieszkańcami z generatora podaje ich imiona` (porównanie z `st.people[p.person].name`), `bez generatora lokatorzy to pusta lista albo brak pola`, `host.lokator(id) zwraca tę samą osobę`.
- [ ] **Step 2: Run** `npm test -- lokatorzy-zarzad`: FAIL.
- [ ] **Step 3: Implement** z `snapshot(st, w).lokatorzy` (filtr rodzaju `resident`).
- [ ] **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `git commit -m "Zarząd widzi mieszkańców z generatora"`

### Task 5: Awans mieszkańca i wyjście bramą

**Files:**
- Modify: `src/sim/sim.ts` (nowe funkcje, prace `odejscie` i `sprawdz`), `src/sim/gov.ts` (`applyGov`, `pawnOf` dla każdego pionka z osobą i potrzebami), `src/gov/typy.ts` (`GovEffects.awans`, `GovEffects.wyrzuc`, `GovEffects.sprawdz`), `src/gov/tresc.ts` + `src/gov/wydarzenia.ts` (host)
- Test: `tests/unit/awans-wyrzucenie.test.ts`

**Interfaces:**
- Produces: `export function awansuj(st: SimState, w: World, personId: string): boolean` (pionek tej osoby rodzaju `resident` albo `gosc` staje się `core`; potrzeby zostają albo dostaje domyślne jak w `addCore`; mieszkanie `apt` = −1; łóżko zostaje jego), `export function wyprowadz(st: SimState, w: World, personId: string): boolean` (mieszkaniec albo osoba zarządu: praca `odejscie` do `exitOf(w)` warstwą zarządu, potem warstwą ulicy do kafelka 70 kroków od siatki, potem znika jak przechodnie w fazie 4; łóżko wolne od razu; osoba zarządu dostaje `gone` jak w `removeCore`), `export function sprawdz(st: SimState, w: World, personId: string, tile: number): boolean` (osoba zarządu: praca `sprawdz` do najbliższego osiągalnego kafelka przy `tile`, 10 minut gry tam, koniec pracy), `GovEffects.awans?: string[]`, `GovEffects.wyrzuc?: string[]`, `GovEffects.sprawdz?: { id: string; tile: number }[]`, `GovHost.awansuj(id: string): void`, `GovHost.wyrzuc(id: string): void` (mieszkaniec albo osoba zarządu), `GovHost.sprawdz(id: string, tile: number): void`. `fx.needs` i `fx.moods` trafiają do każdego pionka z tą osobą i potrzebami (zarząd, mieszkaniec, gość).

- [ ] **Step 1: Write the failing tests:** `awansuj: ten sam pionek, ta sama osoba, kind core, bierze polecenia (commandFor)`, `wyprowadz mieszkańca: pionek wychodzi bramą i znika w ciągu 2 h gry, residents −1`, `wyprowadz osobę zarządu: wychodzi bramą, znika, nie ma jej w people zarządu`, `sprawdz: osoba idzie, stoi 10 minut i wraca do zajęć`, `fx.moods trafia do mieszkańca z osobą`, `zapis i wczytanie w połowie drogi wyrzuconego nie zmienia skrótu po 2 h`, `applyGov stosuje fx.awans, fx.wyrzuc i fx.sprawdz`.
- [ ] **Step 2: Run** `npm test -- awans-wyrzucenie`: FAIL.
- [ ] **Step 3: Implement** według wzoru `przyjmijGospodarstwo` i pracy `arrive`; warstwa w `layerOf` dla pracy `odejscie` jak dla `arrive` do wyjścia za bramę.
- [ ] **Step 4: Run** `npm test -- awans-wyrzucenie applygov sim`: PASS.
- [ ] **Step 5: Commit** `git commit -m "Symulacja: awans do zarządu, wyjście bramą i sprawdzanie"`

### Task 6: Karty z sytuacji z mieszkańcami

**Files:**
- Modify: `src/gov/warianty.ts` (`fachowiec`, `kradziez`, `klotnia`, `odejscie`), `src/gov/warianty.en.ts`, `src/gov/tresc.ts` (`bezsennosc`, `dym`, `latarka`, `krzyk`, `halas`)
- Test: `tests/unit/wydarzenia-lokatorzy.test.ts`

**Interfaces:**
- Consumes: `GovHost.lokatorzy/lokator/awansuj/wyrzuc/sprawdz` (zadania 4–5).

- [ ] **Step 1: Write the failing tests** (host z atrapy z trzema mieszkańcami z imionami):
  - `fachowiec w bloku bierze mieszkańca z umiejętnością, której zarząd nie zna, a Wciągnąć to awans tej osoby` (tekst zawiera jej imię; `fx.awans` = [jej id]; `fx.join` puste),
  - `kradziez wypada tylko bez podpisanej uchwały u_kociol i przy mieszkańcu z nastrojem < 45, sprawcą jest ten z najniższym nastrojem, tekst z jego imieniem mówi, że od kilku dni je za mało, Wyrzucić to fx.wyrzuc`,
  - `Dać mu jeść z kotła: Jedzenie −2, jego nastrój „Najadł się z kotła” +6 na 24 h (fx.moods), zaufanie +1`,
  - `odejscie Niech idzie i klotnia z wyprowadzką: fx.wyrzuc tej osoby zarządu zamiast fx.leave`,
  - `krzyk i halas: Sprawdzić wysyła fx.sprawdz z kafelkiem siatki od właściwej strony (krzyk: od strony najbliższego budynku mieszkalnego za siatką; halas: od strony garaży albo przy największej dziurze)`,
  - `kradziez ma odstęp 48 godzin gry`,
  - `klotnia bierze dwie osoby zarządu z najniższym nastrojem, bez pary poniżej 55 karty nie ma`,
  - `bezsennosc bierze nieśpiącego z najniższym bezpieczeństwem`,
  - `dym i latarka w bloku z mieszkańcami mówią o najstarszej mieszkance po imieniu, bez słowa „piętr”`,
  - `bez mieszkańców z osobą teksty jak dziś` (porównanie z dzisiejszym tekstem).
- [ ] **Step 2: Run** `npm test -- wydarzenia-lokatorzy`: FAIL.
- [ ] **Step 3: Implement.** Angielskie odpowiedniki w `warianty.en.ts` (nowy wybór „Feed him from the pot” / „Feed her from the pot”). Kafelek dla `krzyk`/`halas` przychodzi z wejścia: nowe `GovInput.strony?: { garaze?: number; blok?: number }` (kafelek podwórka przy siatce najbliżej garaży i najbliżej budynku mieszkalnego za siatką), liczone w `govInput` ze świata; przy dziurze bez stron kafelek dziury.
- [ ] **Step 4: Run** `npm test -- wydarzenia-lokatorzy wydarzenia03-en zarzad-jezyk events wydarzenia-miejsce`: PASS (test zgodności z 0.3 bez zmian).
- [ ] **Step 5: Commit** `git commit -m "Wydarzenia: fachowiec, kradzież, kłótnia, odejście i sąsiadki z prawdziwych ludzi"`

### Task 7: Pogrzeb

**Files:**
- Modify: `src/gov/tresc.ts` (wydarzenie `pogrzeb`), `src/gov/typy.ts` (`GovState.pogrzebN`), `src/gov/wydarzenia.ts` (wyzwalacz z listy zgonów, jak `dym`)
- Test: `tests/unit/pogrzeb.test.ts`

**Interfaces:**
- Produces: `GovState.pogrzebN?: number`; karta `pogrzeb` z danymi `{ id: string; name: string; f: boolean; cause: string }`.

- [ ] **Step 1: Write the failing tests:** `po zgonie z imieniem karta pogrzeb przychodzi w ciągu doby za dnia albo wieczorem`, `trzy wybory: pochować (nastrój „Pożegnaliśmy …” +2 na dobę wszystkim, kopiący odpoczynek −10), przy kozie (+1), bez ceremonii (wkurzenie +1)`, `każdy zgon najwyżej jedna karta (pogrzebN)`, `w trybie zombie tekst mówi, czy ciało dobito`, `angielski bez polskich słów`.
- [ ] **Step 2–4:** Run FAIL, implement (płeć zmarłego z `GovInput.dead`; jeśli brak, z osoby zarządu albo mieszkańca), Run PASS z `zarzad-zombie`.
- [ ] **Step 5: Bramka etapu 2** (pełne testy, build, boty, nowe scenariusze `wyd-fachowiec` (karta z imieniem mieszkańca, potem karta osoby po awansie) i `wyd-kradziez` (wyrzucony idzie do bramy), zrzuty obejrzane).
- [ ] **Step 6: Commit** `git commit -m "Wydarzenia: pogrzeb po prawdziwej śmierci"`

## Etap 3: gość z klocków i zwierzęta

### Task 8: Klocki gościa

**Files:**
- Create: `src/gov/goscie.ts`
- Test: `tests/unit/goscie-klocki.test.ts`

**Interfaces:**
- Produces:

```ts
export type KtoId = 'wedrowiec' | 'rodzina' | 'dezerter' | 'uciekinier' | 'chory' | 'dziecko' | 'znajomy' | 'ocaleni' | 'z_ugryzionym';
export type ChceId = 'nocleg' | 'jedzenie' | 'leki' | 'wymiana' | 'dolaczyc' | 'przechowac' | 'wiadomosc' | 'dobic';
export type MaId = 'fach' | 'rzecz' | 'wiadomosc' | 'ostrzezenie' | 'nic';
export type HaczykId = 'prawda' | 'klamie' | 'chory' | 'poscig' | 'ugryziony';
export type Strona = 'n' | 'e' | 's' | 'w';
export interface Gosc {
  id: string; osoby: Person[] /*1–12, [0] mówi*/; ugryziony?: number /*indeks w osoby*/; kto: KtoId; chce: ChceId; ma: MaId; haczyk: HaczykId;
  skad: { strona: Strona; nazwa: Tx; klucz?: string }; satyra?: string; wraca?: string;
  rzecz?: { arms?: string; meds?: number; ammo?: Partial<Record<'naboje' | 'loftki' | 'belty', number>> };
}
export interface KontekstGoscia {
  mode: GameMode; pora: Pora; season: number; zapasy: number; okolica: readonly Miejsce[];
  znane: ReadonlySet<Dom>; napady: number; dom: boolean;
  /** narrator po długim spokoju (zadanie 16): haczyk inny niż 'prawda' ×1,5 */
  ostrzej?: boolean;
}
export function skladGoscia(rng: Rng, n: number, ctx: KontekstGoscia, used: ReadonlySet<string>): Gosc;
export function tytulGoscia(g: Gosc, s: Words, e: WordsEn): Tx;
export function tekstGoscia(g: Gosc, s: Words, e: WordsEn): Tx;   // kto i skąd, czego chce, zdanie z tropem haczyka, satyra
export const KTO: Record<KtoId, { tryby: readonly GameMode[]; chce: readonly ChceId[]; wiek: [number, number]; ilu: [number, number] }>;
export function osobyGrupy(rng: Rng, n: () => number, kto: KtoId, ilu: number, used: ReadonlySet<string>): Person[];  // też dla kart z gościem (zadanie 11)
```

- [ ] **Step 1: Write the failing tests:** `ten sam rng daje tego samego gościa`, `wielkość grupy z KTO.ilu (wędrowiec 1, rodzina 3–5, ocaleni 2–4, z_ugryzionym 2), rodzina ma wspólne nazwisko (forma żeńska i męska), ugryziony to indeks w osoby`, `200 gości z 200 ziaren: każdy kto/chce/ma/haczyk zgodny z trybem i tabelą wykluczeń`, `ugryziony i ocaleni tylko w zombie, kłamie i pościg tylko w zwykłym`, `zimą chory częściej niż latem (1000 losowań)`, `skąd bierze miejsce z okolicy od strony wejścia, bez nazwy, która wygląda na imię i nazwisko`, `tekstGoscia po angielsku bez polskich słów (lista z zarzad-jezyk)`, `trop haczyka: każdy haczyk ma co najmniej 3 zdania tropu w obu językach`.
- [ ] **Step 2: Run** `npm test -- goscie-klocki`: FAIL.
- [ ] **Step 3: Implement.** Osoby: `makePerson(rng, used, n, { prof })` z fachem pasującym do archetypu i wiekiem z `KTO[kto].wiek` dla mówiącego; reszta grupy z wiekiem rodziny (dzieci 4–15, dziadkowie 65–85) i nazwiskiem mówiącego. `KTO.ilu`: wędrowiec, dezerter, uciekinier, chory, znajomy [1,1]; dziecko [1,2]; rodzina [3,5]; ocaleni [2,4]; z_ugryzionym [2,2]. Wagi: zima `chory` ×2, zapasy > 20 `klamie` ×1,5, każda napaść −20% szansy na gościa (zwraca to `wagaGoscia(ctx): number`, też eksport). Treść pierwszej paczki: po 3 warianty zdania na kto, chce, ma i trop haczyka, 8 linijek satyry, w obu językach.
- [ ] **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `git commit -m "Zarząd: goście składani z klocków"`

### Task 9: Pionek gościa w symulacji

**Files:**
- Modify: `src/sim/sim.ts` (rodzaj `gosc`, praca `gosc`, plan, rozkazy, kradzież, warstwy, `isPrey`, `spooked`, `speedOf`, `die`), `src/sim/gov.ts` (`govInput.goscie`, `applyGov`: `fx.gosc`, `fx.goscRozkaz`), `src/gov/typy.ts`, `src/render/game.ts` (`STRANGERS`), `src/sim/orders.ts` (`jobText`)
- Test: `tests/unit/gosc-sim.test.ts`

**Interfaces:**
- Consumes: `Gosc` (zadanie 8) tylko jako `osoby`, `looks`, `strona` w planie.
- Produces:

```ts
// typy.ts
export type FazaGoscia = 'idzie' | 'brama' | 'w_srodku' | 'odchodzi' | 'zlapany' | 'poszedl' | 'nie_doszedl' | 'zginal';
export interface GovGosc { id: string; faza: FazaGoscia; tile: number; pawns: number[]; ukradl: number }
// GovInput.goscie?: GovGosc[]  (obecne, choćby puste, tylko gdy st.obcy)
// GovEffects.gosc?: { id: string; osoby: Person[]; looks: number[]; strona: Strona; ugryziony?: number };
// GovEffects.goscRozkaz?: { id: string; co: 'odejdz' | 'jedzenie' | 'noc' | 'zostan' | 'zarzad' | 'klamie' | 'ugryziony' | 'puscic' }[];
// sim.ts: SimState.goscie?: { id: string; pawns: number[]; faza: FazaGoscia; at: number; klamie?: boolean; ukradl: number; ugryziony?: number }[]
```

Grupa: po pionku na osobę; mówiący prowadzi, reszta idzie na kafelki obok niego (jak `SPREAD` przy przyjętych), faza grupy to faza mówiącego, a gdy mówiący zginie, prowadzi następny żywy. Rozkazy dotyczą całej grupy (`zarzad`: mówiący do zarządu, reszta jak `zostan`). Fazy w symulacji: `idzie` (warstwa ulicy do `outsideOf(gateTiles)[0]`), `brama` (czeka), po `noc` faza `w_srodku` (warstwa zarządu przez bramę, do kafelka przy ognisku albo przed drzwiami siedziby, śpi tam; o 6:00 + 0–2 h wychodzi bramą: `odchodzi`), po `klamie` przy `w_srodku`: o 2:00 idzie do sterty `jedzenie`, bierze do 3 sztuk (`ukradl`), wychodzi bramą albo najbliższą dziurą; gdy po drodze w promieniu 8 m jest pionek zarządu, który nie śpi: faza `zlapany` i stoi; `puscic`: wychodzi bez łupu (łup zostaje na ziemi), `zostan`: jak `przyjmijGospodarstwo` (rodzaj `resident`, wszyscy), `zarzad`: mówiący jak `awansuj`, `ugryziony`: `infect(st, p, true)` przy wejściu osoby z indeksem `ugryziony`. Gość, który nie dojdzie do bramy w 2 h gry: `nie_doszedl` i odchodzi. Zakończone wpisy (`poszedl`, `nie_doszedl`, `zginal`, przyjęci) zostają w `SimState.goscie` do odczytu przez zarząd (licznik `GovState.goscie.czytane`).

- [ ] **Step 1: Write the failing tests:** `plan gościa wystawia pionek z osobą po stronie ulicy i prowadzi go pod bramę bez losowania ze st.rng` (skrót `st.rng` przed i po wystawieniu ten sam), `rozkaz odejdz: gość znika za mapą`, `noc: gość wchodzi bramą i śpi przy ognisku, rano wychodzi`, `klamie bez warty: o 2:00 bierze jedzenie i wychodzi, sterta mniejsza o ukradl`, `klamie z wartownikiem w pobliżu: faza zlapany`, `grupa trzech osób dochodzi razem i staje obok siebie pod bramą`, `zostan: cała grupa jako resident z mieszkaniami`, `zarzad: mówiący core, reszta resident`, `śmierć mówiącego: prowadzi następny żywy, faza zginal dopiero, gdy nie żyje nikt`, `w trybie zombie szwendacz przy bramie płoszy gościa: poszedl`, `zapis i wczytanie gościa w środku nocy: ten sam skrót po 6 h`, `stary zapis bez goscie się wczytuje`, `bez obcy GovInput.goscie nie ma`.
- [ ] **Step 2: Run** `npm test -- gosc-sim`: FAIL.
- [ ] **Step 3: Implement** według Interfaces; start pionka: najdalszy kafelek `lay.outside` (BFS od kafelka przy bramie) leżący po podanej stronie środka mapy, remis najmniejszy indeks.
- [ ] **Step 4: Run** `npm test -- gosc-sim wedrowcy handlarz obcy-zombie sim`: PASS.
- [ ] **Step 5: Commit** `git commit -m "Symulacja: gość pod bramą, nocleg, kradzież i przyjęcie"`

### Task 10: Karta gościa w zarządzie

**Files:**
- Modify: `src/gov/wydarzenia.ts` (wydarzenie `gosc` w puli, plan, karta przy fazie `brama`, karta `zlapany`), `src/gov/typy.ts` (`GovState.goscie`, `GovState.wskazowki`), `src/gov/wyprawy.ts` (wskazówka przy rozliczeniu), `src/gov/noc.ts` (pościg: szansa napadu ×1,5 i posterunek `brama`)
- Test: `tests/unit/gosc-zarzad.test.ts`

**Interfaces:**
- Consumes: `skladGoscia`, `tekstGoscia`, `tytulGoscia`, `wagaGoscia` (zadanie 8), `GovGosc`, `GovEffects.gosc/goscRozkaz` (zadanie 9).
- Produces: `GovEffects.halas?: { tile: number; r: number }` (`applyGov` dopisuje do `st.noise` jak `addNoise`, z eksportowaną stałą `NOISE_TICKS`), `GovState.goscie?: { n: number; czytane: number; aktywny?: { gosc: Gosc; od: number; karta: boolean } }`, `GovState.wskazowki?: Record<string, { dzien: number }>` (klucz miejsca z okolicy albo id celu z `TARGETS`), `export function wskazowka(st: GovState, klucz: string): boolean` w `wyprawy.ts` (zużywa wskazówkę: ryzyko ×0,5, łup ×1,5).

- [ ] **Step 1: Write the failing tests** (atrapa wejścia z `goscie`):
  - `bez GovInput.goscie wydarzenie gosc ma wagę 0`,
  - `gdy wypada gosc, zarząd wysyła plan i nie pokazuje karty, póki gość nie ma fazy brama`,
  - `karta przy fazie brama ma gdzie z kafelka gościa i wybory z chce`,
  - `Odprawić, Jedzenie przez siatkę, Wpuścić na noc, Przyjąć dają właściwe goscRozkaz`,
  - `karta grupy mówi tyle osób, ilu jest pionków, a Przyjąć przy mniejszej liczbie wolnych miejsc mówi, ilu będzie spać na podłodze`,
  - `Wpuścić na noc niedostępne przy bramie na kłódkę po 20:00`,
  - `kłamca wpuszczony na noc dostaje rozkaz klamie, rano linia o liczbie zabranych porcji`,
  - `złapany: karta z trzema wyborami (oddać i wyrzucić, wyrzucić z łupem, zatrzymać do rana)`,
  - `pościg wpuszczony: szansa napadu tej nocy ×1,5 na bramie` (zwykły), `hałas przy bramie` (zombie: `GovEffects.halas = { tile, r: 15 }`, po `applyGov` wpis w `st.noise`),
  - `ugryziony w zombie: Obejrzeć ręce odsłania z pewnością, przy zdrowym zaufanie −1`,
  - `wiadomość daje wskazówkę na miejsce z okolicy, a wyprawa tam ma ryzyko ×0,5`,
  - `gość, który poszedł albo zginął przy otwartej karcie: karta znika, linia w kronice, wybór nie steruje niczym`,
  - `zapis i wczytanie z otwartą kartą gościa: ta sama karta`,
  - `spis 5 gier po 5 dób z obcymi: każda karta gosc ma pionek gosc w fazie brama w chwili pokazania`.
- [ ] **Step 2: Run** `npm test -- gosc-zarzad`: FAIL.
- [ ] **Step 3: Implement.** Waga wydarzenia `gosc`: 1,2 × `wagaGoscia`, `when: ['dzien','wieczor','noc']`, `gap: 6`, najwyżej jeden aktywny gość; strona wejścia od kierunku miejsca z okolicy, bez okolicy z ziarna. „Pokaż” z zadania 3.
- [ ] **Step 4: Run** `npm test -- gosc-zarzad gosc-sim zarzad wyprawy`: PASS.
- [ ] **Step 5: Commit** `git commit -m "Zarząd: karta gościa pod bramą, haczyki i wskazówki"`

### Task 11: Karty z 0.3 z gościem pod bramą

**Files:**
- Modify: `src/gov/tresc.ts` (`GEventDef.gosc`, `PlanGoscia`), `src/gov/wydarzenia.ts` (karta czeka na grupę jak gość z klocków; host `przyjmijGosci`, `przyjmijDoZarzadu`, `odprawGosci`, `nakarmGosci`), `src/gov/warianty.ts` (`uchodzcy`, `influencer`, `aktywisci`, `dzieci`, `krypto`, `fachowiec` w domu), `src/gov/warianty.en.ts`
- Test: `tests/unit/karty-z-gosciem.test.ts`

**Interfaces:**
- Consumes: `osobyGrupy` (zadanie 8), `GovEffects.gosc/goscRozkaz`, `GovGosc` (zadanie 9), mechanika czekania na fazę `brama` i „Pokaż” (zadanie 10).
- Produces: `export interface PlanGoscia { osoby: Person[]; kto: KtoId | 'sasiad' | 'aktywisci' | 'influencer' | 'dzieci'; strona?: Strona }`, `GEventDef.gosc?: (h: GovHost, d: D) => PlanGoscia | null`; host: `przyjmijGosci(): void` (`goscRozkaz` `zostan`), `przyjmijDoZarzadu(i: number): void` (osoba `i` do zarządu, reszta `zostan`), `odprawGosci(): void` (`odejdz`), `nakarmGosci(n: number): void` (`jedzenie`, Jedzenie −n), `nocGosci(): void` (`noc`).

Karta z `gosc` w danych z `make` dostaje osoby: `uchodzcy` n osób (mówiący to `d.spec`, gdy jest), `influencer` 1 (`d.p`), `aktywisci` 4, `dzieci` 2–3 (wiek 9–15), `krypto` 1 (sąsiad z bloku obok), `fachowiec` w domu 1 (`d.p`). Wybory nakładek zamiast `addPeople`/`joinPerson` wołają metody hosta: uchodźcy „Przyjąć …” to `przyjmijGosci` (mówiący z fachem do zarządu, gdy 0.3 tak robiło), aktywiści „Zaprosić do ciepła” to `nocGosci`, influencerka „Przyjąć” to `przyjmijDoZarzadu(0)`, dzieciaki po wymianie `odprawGosci`, krypto po decyzji `odprawGosci`, fachowiec w domu `przyjmijDoZarzadu(0)`. Bez `GovInput.goscie` te karty mają wagę 0.

- [ ] **Step 1: Write the failing tests:** `uchodzcy: plan n osób, karta dopiero przy fazie brama, tekst z liczbą n równą liczbie pionków`, `Przyjąć wszystkich to goscRozkaz zostan dla tej grupy, bez fx.residents i bez fx.join`, `influencer Przyjąć to zarzad dla tej osoby, imię w karcie równe imieniu pionka`, `aktywisci Zaprosić do ciepła: noc, rano odchodzą`, `dzieci i krypto po decyzji odchodzą`, `fachowiec w domu przychodzi do furtki`, `bez GovInput.goscie waga 0 dla wszystkich sześciu`, `test zgodności z 0.3 bez zmian`, `angielski bez polskich słów`.
- [ ] **Step 2: Run** `npm test -- karty-z-gosciem`: FAIL.
- [ ] **Step 3: Implement** według Interfaces (wspólna droga z kartą gościa z klocków w `wydarzenia.ts`, bez drugiej kopii logiki czekania).
- [ ] **Step 4: Run** `npm test -- karty-z-gosciem gosc-zarzad events wydarzenia-miejsce wydarzenia03-en przyjecia`: PASS.
- [ ] **Step 5: Commit** `git commit -m "Wydarzenia: uchodźcy, influencerka, aktywiści, dzieciaki i sąsiad naprawdę pod bramą"`

### Task 12: Pies i kot

**Files:**
- Modify: `src/sim/sim.ts` (rodzaje `pies`, `kot`, zachowanie, szczekanie, `isPrey` dla psa, `die` bez wstawania i bez wpisu zmarłych), `src/sim/gov.ts` (`applyGov`: `fx.zwierze`), `src/gov/typy.ts` (`GovEffects.zwierze`, `GovState.flags.cat`), `src/gov/tresc.ts` (`pies`, `kot` ustawiają zwierzę), `src/render/art/zwierzeta.ts` (nowy atlas rysowany kodem), `src/render/view.ts` + `src/render/poses.ts` + `src/render/ludziePixellab.ts` (wyłączenie z ludzi PixelLab)
- Test: `tests/unit/zwierzeta.test.ts`, `tests/unit/zwierzeta-art.test.ts`

**Interfaces:**
- Produces: `GovEffects.zwierze?: ('pies' | 'kot')[]`, `GovState.flags.cat?: boolean`, `export function makeAnimalAtlas(): …` (kształt jak `makeZombieAtlas`), rodzaje `'pies' | 'kot'` w `PawnKind`, napis szczekania `SimState.szczek?: { tick: number }` do napisu nad psem.

- [ ] **Step 1: Write the failing tests:** `przygarnięty pies przychodzi zza siatki i zostaje na podwórku przy bramie`, `nocą pies leży przy bramie`, `szwendacz w 15 m: pies szczeka, w trybie zombie st.noise dostaje hałas 12 m`, `pies zabity przez szwendacza nie wstaje i nie ma go w GovInput.dead`, `kot śpi przy kozie zarządu`, `stary zapis z flags.dog bez pionka psa dostaje psa po wczytaniu`, `atlas zwierząt ma klatki dla obu rodzajów (Node)`.
- [ ] **Step 2–4:** FAIL, implement, PASS z `applygov sim zombie`.
- [ ] **Step 5: Bramka etapu 3** (pełne testy, build, boty, `npm run perf` bez spadku poniżej 55 kl/s na laptopie, scenariusze `wyd-gosc-brama` (karta z „Pokaż”, po kliknięciu kamera przy gościu), `wyd-gosc-noc` (gość przy ognisku nocą), `wyd-zlapany`, `wyd-pies`, `wyd-kot`, `en-wyd-gosc`, zrzuty obejrzane).
- [ ] **Step 6: Commit** `git commit -m "Pies i kot jako pionki"`

## Etap 4: pamięć o znajomych

### Task 13: Znajomi, powroty i znajomy w napadzie

**Files:**
- Create: `src/gov/znajomi.ts`
- Modify: `src/gov/typy.ts` (`GovState.znajomi`, `RaidPlan.znajomy`), `src/gov/wydarzenia.ts` (wpis po decyzji o gościu i po wyrzuceniu, wydarzenie `powrot`), `src/gov/noc.ts` (`confirm`: znajomy w planie napadu, `resolveRaid`: linia raportu), `src/sim/sim.ts` (`spawnRaid`: jeden szabrownik z wyglądem znajomego), `src/sim/gov.ts`
- Test: `tests/unit/znajomi.test.ts`

**Interfaces:**
- Produces:

```ts
export type JakId = 'nakarmiony' | 'nocleg' | 'przyjety' | 'odprawiony' | 'okradl' | 'wyrzucony' | 'zlapany';
export interface Znajomy {
  id: string; osoba: Pick<Person, 'first' | 'name' | 'f' | 'age'>; look: number;
  kto: KtoId | 'lokator'; jak: JakId; nastawienie: number; dzien: number; wizyty: number; ostatnio: number;
}
export function zapamietaj(st: GovState, z: Omit<Znajomy, 'nastawienie' | 'wizyty' | 'ostatnio'>, d: number): void;
export function epitet(z: Znajomy): Tx;          // „ten od słoików”, „ta, którą wyrzuciliście w deszcz”
export function doPowrotu(st: GovState, day: number, mode: GameMode): Znajomy | null;
export function wrogDoNapadu(st: GovState, day: number): Znajomy | null;
// RaidPlan.znajomy?: { id: string; imie: Tx; epitet: Tx; look: number }
```

Nastawienie: nakarmiony +1, nocleg +1, przyjęty +2, odprawiony 0 (−1, gdy chciał jedzenia, a zapasów było ponad 5), okradł −1, złapany i wyrzucony −2, wyrzucony mieszkaniec −2; zakres −2..2. Powrót: znajomy sprzed ≥ 2 dni, najwyżej raz na 4 dni, dodatni jako gość z tą samą osobą (`Gosc.wraca`) i darem (drugi gość do przyjęcia, `later()` z 2–4 porcjami, wskazówka), ujemny w zwykłym trybie do najbliższego napadu (raport: „Wśród nich był {imie}, {epitet}.”), w zombie ujemny nie wraca.

- [ ] **Step 1: Write the failing tests:** `każda decyzja o gościu zapisuje znajomego z nastawieniem z tabeli`, `wyrzucony mieszkaniec to znajomy −2`, `dodatni znajomy wraca jako gość z tym samym imieniem po co najmniej 2 dniach`, `ujemny trafia do planu napadu i do raportu z epitetem`, `szabrownik z planu ze znajomym ma jego wygląd`, `w zombie ujemny nie wraca`, `epitet po angielsku bez polskich słów`, `stary zapis bez znajomi`.
- [ ] **Step 2–4:** FAIL, implement, PASS z `noc applygov zarzad`.
- [ ] **Step 5: Bramka etapu 4** (pełne testy, build, boty, scenariusz `wyd-powrot` (raport rano z linią o znajomym), zrzut obejrzany).
- [ ] **Step 6: Commit** `git commit -m "Zarząd pamięta ludzi: powroty i znajomy wśród szabrowników"`

## Etap 5: łańcuchy, wątki sezonu, narrator

### Task 14: Silnik łańcuchów i wątki sezonu

**Files:**
- Create: `src/gov/watki.ts`
- Modify: `src/gov/typy.ts` (`GovState.watki`), `src/gov/wydarzenia.ts` (kroki w puli z pierwszeństwem)
- Test: `tests/unit/watki.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Krok extends GEventDef { lancuch: string; nr: number; po: number /*najmniej godzin gry od haka*/; hak?: string /*wymagany hak*/ }
export interface Lancuch { id: string; tryby: readonly GameMode[]; kroki: readonly Krok[] }
export const LANCUCHY: readonly Lancuch[];
export function wybierzWatki(st: GovState, mode: GameMode): string[];   // 3 z pasujących, Fisher-Yates z rng zarządu, raz na grę
export function hak(st: GovState, id: string, t: number, d?: unknown): void;
export function krokiGotowe(st: GovState, t: number, mode: GameMode): Krok[];  // pierwsze kroki wybranych i kroki z dojrzałym hakiem
// GovState.watki?: { wybrane: string[]; haki: Record<string, { t: number; d?: unknown }>; krok: Record<string, number> }
```

Kroki z dojrzałym hakiem wypadają przed zwykłą pulą z szansą 0,6 przy każdym losowaniu; pierwsze kroki wybranych łańcuchów wchodzą do puli z wagą 1. Krok może planować gościa z ustalonymi klockami (przez to samo `GovEffects.gosc`).

- [ ] **Step 1: Write the failing tests:** `wybór wątków zależy tylko od ziarna i trybu`, `łańcuch testowy z trzema krokami przechodzi kroki w kolejności po hakach i odstępach`, `krok bez dojrzałego haka nie wypada`, `zapis i wczytanie w środku łańcucha`, `stary zapis bez watki`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `git commit -m "Zarząd: silnik łańcuchów i wątki sezonu"`

### Task 15: Dwanaście łańcuchów

**Files:**
- Modify: `src/gov/watki.ts` (treść `LANCUCHY`), ewentualnie `src/gov/watki-tresc.ts`, jeśli plik przekroczy 800 linii
- Test: `tests/unit/watki-tresc.test.ts`

**Interfaces:**
- Consumes: `Krok`, `Lancuch`, `hak` (zadanie 14); `GovHost` z `lokatorzy`, `awansuj`, `wyrzuc`; plan gościa (zadania 9–11); `zapamietaj` (zadanie 13); `wskazowka` (zadanie 10).

Łańcuchy (3 tylko zwykły, 3 tylko zombie, 6 w obu), każdy 2–4 kroki, każdy kończy się czymś widocznym (gość, wskazówka, znajomy, awans, rzecz, zgon w zombie):
1. obie: światło w oknie naprzeciwko → chłopak z babcią pod bramą (gość) → babcia chora, prośba o leki → apteka (wskazówka) albo znajomy −2;
2. obie: pies sąsiadów ujada nocami → ślady przy siatce → pies przychodzi sam (flaga `dog`) albo zostaje u sąsiadów;
3. obie: ktoś z mieszkańców zbiera puszki → okazuje się, że buduje radio → wieść ze świata albo awans do zarządu (fach elektryka);
4. obie: dziecko z bloku obok przychodzi po wodę → wraca z rodzeństwem → rodzice proszą o przyjęcie (dwóch gości);
5. obie: stary list z 2026 w skrzynce → adres z okolicy → wyprawa ze wskazówką;
6. obie: mieszkanka choruje na płuca → potrzeba leków dwa razy → wdzięczność (nastrój osiedla, zaufanie) albo zgon i pogrzeb;
7. zwykły: chłopak z ochrony zamkniętego osiedla ostrzega przed napadem → napad tej nocy z ostrzeżeniem albo bez → dezerter prosi o przyjęcie;
8. zwykły: handlarz zostawia dług do oddania → przy następnej wizycie prawdziwego handlarza (warunek: `GovInput` widzi handlarza) → lepsza oferta albo zła sława;
9. zwykły: aktywistka od kóz wraca zimą → prosi o miejsce przy kozie → zostaje i uczy dzieci (awans do zarządu, fach nauczyciela);
10. zombie: ktoś woła z dachu sąsiedniego bloku → po nocy ciszej → ocaleni pod bramą z ukrytym ugryzieniem;
11. zombie: matka z ugryzionym synem prosi o dobicie → zostaje u was albo odchodzi z nim do stada;
12. zombie: radio łapie głos wojskowego → obietnica ewakuacji o świcie → nikt nie przychodzi (nastrój), a w okolicy zostaje opuszczony posterunek (wskazówka z bronią).

- [ ] **Step 1: Write the failing tests:** `12 łańcuchów, 3/3/6 według trybów, 2–4 kroki`, `każdy łańcuch przechodzi do końca w atrapie z wymuszonymi hakami bez wyjątku`, `każdy krok ma teksty w obu językach, angielski bez polskich słów`, `bez słów „piętr”, numerów mieszkań i nazwisk z listy zakazanych`.
- [ ] **Step 2–4:** FAIL, napisać treść (ton jak w `src/gov/tresc.ts` i `src/gov/ulica.ts`: zwykłe zdania, konkret z podwórka, satyra na dzisiejszą technikę oglądaną z 2051), PASS.
- [ ] **Step 5: Commit** `git commit -m "Dwanaście łańcuchów historii, po polsku i po angielsku"`

### Task 16: Narrator

**Files:**
- Create: `src/gov/narrator.ts`
- Modify: `src/gov/typy.ts` (`GovState.napiecie`, `GEventDef.ton`), `src/gov/zarzad.ts` (aktualizacja w `govUpdate`), `src/gov/wydarzenia.ts` (mnożniki wag), oznaczenie `ton` na kartach (`ostre`: kradzież, pościg, szwendacz, krzyk, pożar; `lagodne`: kot, sygnał, dym, domofon, dron, jabłka i podobne)
- Test: `tests/unit/narrator.test.ts`

**Interfaces:**
- Produces: `GovState.napiecie?: { v: number; t: number; spokoj: number }` (`v` 0–100, `t` minuta gry ostatniej aktualizacji, `spokoj` minuty gry z `v < 20`), `export function napiecie(st: GovState, i: GovInput): void`, `export function mnoznik(st: GovState, ton: 'ostre' | 'lagodne' | undefined): number`, `GEventDef.ton?: 'ostre' | 'lagodne'`.

Liczby ze spec: napad +20 (wtargnięcie +30), zgon +25, rana +10, średnie jedzenie zarządu < 30: +5 na godzinę gry, przerwanie siatki (zombie) +15, spadek 2 na godzinę gry. Powyżej 60: ostre ×0,3, łagodne ×2; `spokoj` ponad 24 h gry: ostre ×2, a w `KontekstGoscia` haczyk inny niż `prawda` ×1,5.

- [ ] **Step 1: Write the failing tests:** `zgon podnosi napięcie o 25`, `napięcie spada o 2 na godzinę gry`, `przy 70 karta ostra ma wagę ×0,3`, `po dobie spokoju ostra ×2`, `100 losowań przy wysokim napięciu: więcej łagodnych niż przy niskim`, `stary zapis bez napiecie`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `git commit -m "Zarząd: narrator z krzywą napięcia"`

### Task 17: Bramka końcowa, spis i dziennik

**Files:**
- Modify: `tools/shots.ts` (scenariusze `wyd-watek` i `en-wyd-watek`), `docs/OCENA-wydarzenia.md` (sekcja „Po budowie” ze spisem), `docs/POSTEP.md` (wpis, skróty botów, decyzje do przejrzenia)
- Test: pełne

- [ ] **Step 1:** spis kart skryptem z oceny (10 ziaren blok, 5 dom, 5 zombie, po 5 dób, z obcymi): zero kart `handlarz`, każda karta `gosc` z pionkiem w fazie `brama`, w zombie zero kart wykluczonych, 30–40 kart na grę, różne wątki w różnych ziarnach. Wynik do oceny.
- [ ] **Step 2:** `npm test`, `npx biome check src tests tools index.html`, `npm run build`, `npm run bot`, `npm run bot:zombie`, `npm run bot -- --mieszkancy`, `npm run perf`, `npm run shots -- --dalej` (pełne), wszystkie nowe zrzuty obejrzane.
- [ ] **Step 3:** wpis w `docs/POSTEP.md` (co zrobione, liczby bramki, zmienione skróty botów z przyczyną, decyzje do przejrzenia przez Mateusza z projektu, teksty do przeczytania: klocki i łańcuchy).
- [ ] **Step 4: Commit** `git commit -m "Wydarzenia z prawdziwymi ludźmi: bramka, spis i dziennik"`
