# Tryb zombie i broń: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tryb zombie w stylu Walking Dead wybierany na ekranie startowym oraz broń i walka w obu trybach.

**Architecture:** Wszystko, co się dzieje, siedzi w deterministycznej symulacji (`src/sim`): broń i formuły w `bron.ts`, pole odległości i liczebność stada w `zombie.ts`, stan i prace w `sim.ts` w nowych sekcjach „walka” i „szwendacze”. Zarząd (`src/gov`) dostaje tryb i liczby z symulacji przez `GovInput` i oddaje znaleziska i ugryzienia przez `GovEffects`. Rysowanie czyta stan jak dziś.

**Tech Stack:** TypeScript 7, Vite 8, PixiJS 8, Vitest, Playwright, Biome. Skrypty w `tools/` uruchamiane wprost przez Node.

**Spec:** `docs/superpowers/specs/2026-10-17-tryb-zombie-design.md`

## Global Constraints

- Symulacja deterministyczna: losowanie tylko z `st.rng` (`nextRandom`), żadnego `Math.random`, działa w Node.
- Nowe pola stanu opcjonalne; zapis bez nich to tryb zwykły (`readSave` dalej przyjmuje `sim.v === 3`).
- Tryb: `type GameMode = 'zwykly' | 'zombie'`, w adresie `?tryb=zombie`.
- Wartości z tabel specyfikacji przepisane dokładnie (broń, stado, napór 0,004 na krok, ugryzienie 15 / 35% / 18 h, wstawanie 1 h, amputacja 2 h i 0,5 + 0,15 × med).
- Teksty po polsku, bez nazw z serialu poza „szwendacze”.
- Po każdej zmianie wizualnej zrzut w Playwright obejrzany przed „działa”.
- Biome uruchamiać na `src tests tools index.html` (w korzeniu przeszkadzają `.claude/worktrees`).

## Review Focus

- Wczytanie zapisu sprzed zmian: brak `mode`, `weapon`, `store.arms` nie może wywrócić gry; ma być tryb zwykły.
- Szwendacz przy siatce, której kafelek właśnie stał się dziurą, i zarząd stojący na tym kafelku: nikt nie może utknąć w ścianie ani przejść przez zamkniętą bramę.
- Gracz zmienia broń komuś, kto właśnie walczy, albo wysyła na wyprawę ugryzionego: bez wyjątków, wynik opisany w karcie.
- Śmierć ostatniej osoby z zarządu w nocy: zarząd kończy grę „pustką”, nie wywraca się na pustej liście.
- Zapis w środku nocnego stada i wczytanie: ta sama dalsza gra (skrót stanu).

---

### Task 1: Tryb gry, broń i magazyn broni w stanie

**Files:**
- Create: `src/sim/tryb.ts`, `src/sim/bron.ts`
- Modify: `src/sim/sim.ts` (SimState, Pawn, Command, SimOpts, createSim, apply), `src/sim/snapshot.ts` (SimPerson.weapon, SimStock.arms, ammo), `src/sim/orders.ts` (jobText bez zmian)
- Test: `tests/unit/bron.test.ts`

**Interfaces:**
- Produces: `GameMode`, `modeOf(st): GameMode`; `WeaponId`, `AmmoKey`, `Weapon`, `WEAPONS`, `weaponOf(id?: WeaponId | null): Weapon`, `hitChance(w: Weapon, obrona: number, rest: number, maimed: boolean): number`, `START_KIT: Record<GameMode, { core: (WeaponId | null)[]; store: WeaponId[]; ammo: Record<AmmoKey, number> }>`; `SimOpts.mode`; `SimState.mode?`, `store.arms?: WeaponId[]`, `store.ammo?: Record<AmmoKey, number>`; `Pawn.weapon?: WeaponId | null`, `Pawn.hp?`, `Pawn.cd?`; polecenie `{ t: 'arm'; ids: number[]; weapon: WeaponId | null }` (bierze z magazynu, stara wraca do magazynu, bez broni w magazynie nic się nie dzieje).

- [ ] Test: tabela `WEAPONS` ma wartości ze specyfikacji; `createSim(w, 3, { core: 4 })` daje siekierę pierwszej osobie, `['noz','lom']` w magazynie, `mode` `'zwykly'`; z `{ mode: 'zombie' }` rewolwer, dzida, łom, nóż, magazyn `['dzida','kij']`, 12 naboi; `arm` zamienia broń z magazynem; stan bez nowych pól (`delete st.mode` itd.) działa w `new Sim` i `modeOf` daje `'zwykly'`; `hitChance` z obroną 2 i siłami 10 równe `hit + 0.1 - 0.15`.
- [ ] Uruchomić `npx vitest run tests/unit/bron.test.ts`, ma paść.
- [ ] Implementacja; `Sim` w konstruktorze uzupełnia brakujące pola (`store.arms`, `store.ammo`) bez losowania.
- [ ] Testy zielone, cały `npm test` zielony (skróty stanu w testach liczone w trakcie, nie stałe).
- [ ] Commit.

### Task 2: Walka, hałas, śmierć i zwłoki

**Files:**
- Modify: `src/sim/sim.ts` (sekcja „walka”: `fight`, ciosy warty, ucieczka, hałas, śmierć), `src/sim/orders.ts` (menu „Atakuj”, opisy prac), `src/sim/snapshot.ts`
- Test: `tests/unit/walka.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `JobKind` + `'fight'`; polecenie `{ t: 'attack'; ids; target: number }` (id pionka); `SimState.noise?: { x: number; y: number; r: number; until: number }[]`; `SimState.fx?: { t: 'cios' | 'strzal' | 'trafienie' | 'ugryzienie' | 'smierc'; x: number; y: number; tick: number }[]` (ostatnie 2 s); `SimState.dead?: { id: string; name: string; look: number; kind: PawnKind; tick: number; cause: 'rany' | 'gorączka' | 'amputacja' }[]`; `SimState.tally?: { killed: number; breaches: number; bites: number; deaths: number }`; rzeczy `'zwloki'` (n: wygląd, owner: indeks w `dead`, fuel: tick wstania albo 0) i `'trup'` (n: wygląd, fuel: tick zniknięcia), `'krew'` (plama, fuel: tick zniknięcia, najwyżej 40 naraz); `isEnemy(p: Pawn): boolean` eksportowane; szabrownik ma `hp` 70 i ucieka przy hp < 35.

- [ ] Test: zarząd z łomem na polecenie `attack` dochodzi do szabrownika na podwórku i go zabija, zostaje `'zwloki'` bez wstawania (zwykły tryb), `dead` ma wpis; warta z nożem przy bramie nie sięga wroga za siatką, z dzidą sięga; strzał z rewolweru zdejmuje nabój i dodaje hałas r 40 na 40 kroków, bez naboi cios jak gołe ręce; mieszkaniec z wrogiem w 8 m idzie do domu; człowiek nie umiera od zimna (zdrowie 0 z potrzeb nie zabija); dwa przebiegi z tym samym ziarnem dają ten sam skrót.
- [ ] Uruchomić, ma paść.
- [ ] Implementacja. Rozstrzygnięcie ciosu: `nextRandom(st.rng) < hitChance(...)`. Przez siatkę: kafelek siatki (albo zamkniętej bramy) na odcinku między stronami to „za siatką”, liczone tak jak `outsideOf` (strona podwórka kontra reszta).
- [ ] Testy zielone, `npm test`, `npm run bot` przechodzi.
- [ ] Commit.

### Task 3: Szwendacze, stado i napór na siatkę

**Files:**
- Create: `src/sim/zombie.ts` (liczebność, pole odległości, wybór krawędzi)
- Modify: `src/sim/sim.ts` (sekcja „szwendacze”, warstwa `zombie` w `composeLayers`, nowe dziury z naporu), `src/sim/perimeter.ts` (`initFence(w, mode)`)
- Test: `tests/unit/zombie.test.ts`

**Interfaces:**
- Consumes: Task 1–2.
- Produces: `PawnKind` + `'zombie'`, `JobKind` + `'zombie'` (fazy: 0 snuje się, 1 idzie do siatki, 2 napiera, 3 goni, 4 idzie na hałas); `ambientCount(day: number): number` = min(30, 6 + 2·day); `hordeSize(day: number): number` = min(60, 8 + 6·(day − 1)); `MAX_ZOMBIES = 80`; `ZOMBIE_HP = 60`; `PUSH = 0.004`; `distField(blocked: Uint8Array, size: number, seeds: readonly number[]): Int32Array`; `spawnZombie(st: SimState, w: World, tile: number, look: number): Pawn`; `SimState.horde?: { day: number; left: number; next: number }`; `FenceState.reinforced?: boolean`.

- [ ] Test: w trybie zombie siatka bez otwartych dziur, wszystkie kafelki 100, brama zamknięta; w zwykłym trybie przez 3 doby zero szwendaczy; za dnia liczba szwendaczy dąży do `ambientCount`; o 21:00–1:00 pojawia się `hordeSize(dzień)`; szwendacze stoją przy siatce i zdejmują wytrzymałość; kafelek z 0 staje się dziurą i szwendacz wchodzi na podwórko, ale nie do pomieszczeń; łata na nowej dziurze działa jak na starej; nigdy więcej niż 80; zapis (`JSON` tam i z powrotem) w środku stada daje ten sam skrót po 2000 krokach.
- [ ] Uruchomić, ma paść.
- [ ] Implementacja. Ruch: zejście po polu odległości, a do widzianej ofiary albo hałasu A* najwyżej 3 wyszukiwania na krok. Prędkość 0,35 i 0,5 `WALK_SPEED`.
- [ ] Testy zielone, `npm test`.
- [ ] Commit.

### Task 4: Ugryzienia, gorączka, wstawanie, dobijanie i amputacja

**Files:**
- Modify: `src/sim/sim.ts`, `src/sim/orders.ts` (menu „Dobić”), `src/sim/snapshot.ts` (SimPerson.bite: { at, limb, left } | null)
- Test: `tests/unit/zombie.test.ts` (nowy `describe`)

**Interfaces:**
- Consumes: Task 2–3.
- Produces: `Pawn.bite?: number` (tick zakażenia), `Pawn.limb?: boolean`, `Pawn.maimed?: boolean`; `BITE_DMG = 15`, `BITE_INFECT = 0.35`, `FEVER_TICKS = 18 * TICKS_PER_HOUR`, `RISE_TICKS = TICKS_PER_HOUR`, `AMPUTATE_WINDOW = 2 * TICKS_PER_HOUR`; polecenia `{ t: 'finish'; ids; thing: number }`, `{ t: 'amputate'; ids; patient: number }`; `JobKind` + `'finish' | 'amputate'`; `infect(st, p: Pawn, limb: boolean): void` eksportowane (do zarządu i testów).

- [ ] Test: zakażony umiera dokładnie po `FEVER_TICKS`, w trybie zombie po `RISE_TICKS` w miejscu zwłok stoi szwendacz; `finish` przed tym sprawia, że nie wstaje; amputacja w oknie z `med` 2 i ziarnem, które wylosuje sukces, zdejmuje zakażenie i 35 zdrowia; po oknie polecenie nic nie robi; śmierć dokłada zły nastrój wszystkim.
- [ ] Uruchomić, ma paść; implementacja; zielone; commit.

### Task 5: Praca za dnia i alarm

**Files:**
- Modify: `src/sim/sim.ts`, `src/sim/orders.ts`
- Test: `tests/unit/zombie.test.ts` albo `tests/unit/walka.test.ts`

**Interfaces:**
- Produces: polecenia `{ t: 'craft'; ids; item: 'dzida' }` (2 deski + 1 złom ze stert, godzina gry, dzida do magazynu), `{ t: 'brace'; ids; tile: number }` (kafelek siatki z wytrzymałością < 100, 2 deski albo 2 złom, 20 minut, +50), `{ t: 'alarm'; ids }` (cały zdolny zarząd: zdrowie > 30, bez wyprawy, na wartę `'siatka'` w trybie zombie, `'brama'` w zwykłym); posterunek `'siatka'` = `SIATKA_POST = -2`, `postKey(-2) === 'siatka'`; warta na `'siatka'` co 10 s gry przechodzi tam, gdzie napiera najwięcej szwendaczy.

- [ ] Test: każdy z trzech poleceń z menu `commandsAt` na właściwym kafelku i jego skutek w stanie; warta `'siatka'` przechodzi do nowego miejsca naporu.
- [ ] Uruchomić, ma paść; implementacja; zielone; commit.

### Task 6: Zarząd w trybie zombie, broń w warcie i na wyprawach

**Files:**
- Modify: `src/gov/typy.ts`, `src/gov/zarzad.ts` (`newGov(seed, mode = 'zwykly')`), `src/gov/noc.ts` (karta, posterunki, ryzyko, raport), `src/gov/tresc.ts` (teksty), `src/sim/gov.ts` (`govInput`: mode, horde, dead, weapon, bitten; `applyGov`: arms, ammo, bitten)
- Test: `tests/unit/zarzad-zombie.test.ts`, istniejące `tests/unit/zarzad.test.ts` i `applygov.test.ts` zielone

**Interfaces:**
- Consumes: Task 1–5.
- Produces: `GovInput.mode?`, `GovInput.horde?: { near: number; pressing: number; killed: number; breaches: number; bites: number }`, `GovInput.dead?: { id: string; name: string; cause: string; tick: number }[]`, `GovPerson.weapon?: string`, `GovPerson.bitten?: boolean`; `GovEffects.arms?: string[]`, `GovEffects.ammo?: Partial<Record<'naboje' | 'loftki' | 'belty', number>>`, `GovEffects.bitten?: string[]`; `GovState.mode?`; `NightCard.horde?: { size: number; word: string; fence: number }`; `weaponFactor(p: GovPerson, ammo: number): number`.

- [ ] Test: w trybie zombie karta nocy bez szansy napadu, z prognozą stada i posterunkiem `'warta:siatka'`, `fx.raid` zawsze null; w zwykłym trybie przy tym samym ziarnie losowania napadu bez zmian względem `main` (porównanie z zapisanym wynikiem testu przed zmianą); wartość warty z dzidą × 1,4; wyprawa w zombie z kłopotami daje `fx.bitten`, a `applyGov` zaraża tę osobę; śmierć z `GovInput.dead` trafia do raportu raz i zmienia zaufanie −5, wkurzenie +8; ostatnia osoba martwa: `over === 'pustka'` bez wyjątku.
- [ ] Uruchomić, ma paść; implementacja; zielone; `npm run bot` i `node tools/trzy-noce.ts` przechodzą; commit.

### Task 7: Interfejs

**Files:**
- Modify: `index.html`, `src/style.css`, `src/main.ts`, `src/content/data.ts` (`LORE_ZOMBIE`), `src/ui/okna.ts` (pomoc, karta nocy z prognozą), `src/ui/karta.ts` (broń, ugryzienie, przyciski), `src/ui/pasek.ts` (siatka, szwendacze), `src/ui/zapis.ts` (etykieta z trybem)
- Test: `tests/unit/interfejs.test.ts`, scenariusze `start-zombie`, `start-zombie-telefon`, `zombie-dzien` w `tools/shots.ts`

**Interfaces:**
- Consumes: Task 1–6.
- Produces: przełącznik `input[name=tryb]` (`zwykly`, `zombie`) w `#startForm`; `?tryb=zombie`; `?stado=N` (tylko do zrzutów i testów: N szwendaczy pod siatką przy wczytaniu); przycisk `#alarm` „Do broni!”; w `window.zm` bez zmian.

- [ ] Test: `statsOf` w trybie zombie ma pola siatki i szwendaczy; `personCard` pokazuje broń i ugryzienie z przyciskiem „Amputować” w oknie i bez niego po oknie; `saveLabel` dopisuje „zombie”.
- [ ] Zrzuty: start na komputerze i telefonie (formularz kończy się powyżej 844 px), gra w trybie zombie za dnia; obejrzane.
- [ ] Commit.

### Task 8: Grafika szwendaczy, walki i siatki

**Files:**
- Create: `src/render/art/bron.ts` (broń w ręce)
- Modify: `src/render/art/people.ts` (wiersze szwendaczy `ZLOOKS = 6`, pozy `swing`, `aim`, `lurch`, `bite`), `src/render/poses.ts`, `src/render/game.ts` (zwłoki, błysk, krąg hałasu, krew), `src/render/view.ts` (broń, paski życia), `src/render/art/podworko.ts` (stan siatki `'wzmocniona'`), `tools/arkusz-wnetrza.ts` albo nowy arkusz broni
- Test: `tests/unit/dym-pozy.test.ts` (pozy z prac), `tests/unit/game.test.ts` (zwłoki, światło strzału), zrzuty `zombie-noc`, `zombie-walka`, `zombie-telefon`

**Interfaces:**
- Consumes: Task 1–5 (`Pawn.weapon`, `job.t === 'fight' | 'zombie'`, `st.fx`, `st.noise`, rzeczy `zwloki`, `trup`, `krew`).
- Produces: `weaponSprite(id: WeaponId, dir: number, pose: 'hold' | 'swing' | 'aim', frame: number)`; `poseOf` dla walki i szwendaczy.

- [ ] Test póz i świateł; zrzuty obejrzane w dzień i nocą, na telefonie.
- [ ] Commit.

### Task 9: Bot, wydajność, zrzuty i dokumenty

**Files:**
- Create: `tools/bot-zombie.ts`
- Modify: `package.json` (`bot:zombie`), `tests/unit/gov-play.ts` (`PlayOpts.mode`), `tools/perf.ts` (`--zombie`), `tools/shots.ts`, `docs/POSTEP.md`, `docs/GDD.md` (sekcja „Tryb zombie”), `CLAUDE.md` (komenda)

- [ ] `npm run bot:zombie`: dwie polityki (warta z dzidami przy siatce i bez warty) przez 6 nocy na Przymorzu; wypisuje na noc stado, zabitych, przerwania, ugryzienia, zgony, siatkę i skrót. Bez warty siatka ma puścić najpóźniej trzeciej nocy, z wartą trzymać co najmniej trzy noce; jeśli nie, stroić liczby w `zombie.ts` i `bron.ts`.
- [ ] `npm run perf -- 150 1 --zombie` z 60 szwendaczami: co najmniej 50 kl/s na laptopie.
- [ ] `npm test`, Biome, `npm run build`, `npm run bot`, `npm run shots` bez błędów; dziennik i GDD.
- [ ] Przegląd całej gałęzi przez niezależnego recenzenta, poprawki, commit.
