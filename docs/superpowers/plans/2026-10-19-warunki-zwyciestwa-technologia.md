# Droga technologii z fabryką, etap 1: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fabryka z obrazu Mateusza staje się widocznym celem tablicy badań (w każdym trybie swoja), a droga „Prąd bez miedzi” w ramie zwycięstwa liczy kamienie z odczytu badań, bez budowli, które czekają na prąd.

**Architecture:** Dane drzewa w `src/sim/badania.ts` (trzy nowe technologie ery 6 za „Siecią bez miedzi”, dwie fabryki końcowe z polem `tryb`, sieć przestaje być końcowa i dostaje własne `siecZbadana`), kamienie drogi w `src/gov/zwyciestwo.ts` z `GovInput.badania` i `GovInput.techDone`, epilog drogi w obu trybach w `src/ui/zwyciestwo.ts`. Budowle generatora i fabryki, „Uruchomić fabrykę”, okna nocą po włączeniu sieci i zwycięstwo w zwykłej grze to etap 2, gdy ery 3–6 dostaną prąd z projektu gospodarki.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`), Vitest, Playwright (`npm run shots`), Biome.

**Spec:** `docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md` (sekcja „1. Technologiczna”, decyzja 4) i `docs/superpowers/specs/2026-10-19-badania-design.md` (drzewo, kartki, technologia końcowa).

## Stan wyjściowy (rozpoznanie 19.10.2026)

- Ery 3–6 są dziś odwrócone (`dziala: false`, poza `DZIALAJA`): kartki mówią „Do tego trzeba prądu” i `chooseResearch` ich nie przyjmie. Gracz dochodzi do ery 2, więc wszystko od ery 3 da się zaliczyć tylko przez stan wpisany w testach albo `window.zm`.
- `t_siec` („Sieć bez miedzi”, era 6, `koncowa: true`, koszt 150 × `KOSZT_ERY[6]` = 450) jest jedyną technologią ery 6 i niczego nie odblokowuje. Akcja „Włączyć sieć” (`orders.ts:459-467`, `Sim.wlaczSiec` w `sim.ts:5369-5374`) wymaga dziś `koncowaZbadana(st)`.
- `TechNowa.tryb` istnieje (kartka z innego trybu jest odwrócona, tablica jej nie pokazuje), ale żadne dane go nie używają. `koncowaZbadana` ignoruje tryb.
- Droga `technologia` w `zwyciestwo.ts` nie ma odczytu: `spelnione` daje 0, ekran pokazuje „Wkrótce”, epilog ma tekst zastępczy „Droga „…” przebyta do końca.”.

## Global Constraints

- Symulacja deterministyczna, bez `Math.random`. Skróty botów bez flag zostają: `npm run bot` da4b24e0 i dad44c81, `npm run bot:zombie` 219e57bd i 7d8fe31b. Nowe technologie są odwrócone, więc żaden bot ich nie zbada; inny skrót to błąd do zgłoszenia, nie do przepisania.
- Er zostaje sześć (`ERY`, `KOSZT_ERY`, `NAZWY_ERY_EN` mają klucze 1–6, szerokość tablicy 1106 px jest przypięta testem, siódma era przewijałaby tablicę na laptopach). Nowe technologie idą do ery 6.
- 24 technologie z 0.3 w `TECH` (`src/content/data.ts`) bez zmian bajt w bajt (`content.test.ts`); nowe wpisy tylko w `WPISY` w `src/sim/badania.ts`.
- W tym etapie żadnych nowych rodzajów budowli, poleceń ani pól `SimState`.
- Napisy w obu językach przez `tx(pl, en)`. Lore: rok 2051, satyra na dzisiejszą technikę (centra danych, humanoidy, regulaminy), bez nazw firm i nazwisk.
- Komentarze po polsku, nagłówki modułów poprawione razem ze zmianą zachowania, importy z `.ts`, `import type` dla typów.
- Commity po polsku ze stopką `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nic nie wypychasz, nie ruszasz innych drzew.

## Review Focus

1. Tryb gry: w zwykłej grze tablica ma fabrykę biorobotów i nie ma fabryki humanoidów, w zombie odwrotnie; w każdym trybie dokładnie jedna złota kartka celu (`.tb-cel`).
2. `koncowaZbadana` liczy tylko fabrykę bieżącego trybu: wpisana w `techDone` fabryka z drugiego trybu nie daje `true`.
3. „Włączyć sieć” po zmianie: w menu pracowni i w `wlaczSiec` warunkiem jest zbadana sieć (`siecZbadana`), nie technologia końcowa, więc sieć da się włączyć przed fabryką.
4. Kolumna ery 6 na tablicy: sieć, generator, serwer i fabryka jedna pod drugą, bez nachodzenia kartek, bez nowego przewijania przy 1024, 1280 i 1440 px.
5. Droga technologii: kamienie nie maleją, „Wkrótce” i „co dalej” nigdy razem, a w zwykłej grze etapu 1 nie da się jej wygrać (tylko `zm.wygraj('technologia')`).

---

### Task 1: Łańcuch fabryki na tablicy badań

**Files:**
- Modify: `src/sim/badania.ts` (`WPISY`, `TECHS`, `koncowaZbadana`, nowe `siecZbadana`, nagłówek)
- Modify: `src/sim/badania.en.ts` (`NAZWY_TECH_EN` i opisy angielskie czterech nowych technologii)
- Modify: `src/sim/orders.ts:459-467`, `src/sim/sim.ts:5369-5374` (warunek „Włączyć sieć”)
- Modify: przypięcia w `tests/unit/badania-dane.test.ts` (:27-31, :91-96, :105-115, :134-136), `badania-tablica.test.ts` (:125, :211, :303-308, :454-456, :596, :607-643), `badania-wiedza.test.ts` (:339-346), `badania-odkrycie.test.ts` (:128-129, :204-207), `badania-zwyciestwo.test.ts`, `tools/shots.ts` (:414, :552-564, :4407)
- Test: `tests/unit/badania-fabryka.test.ts` (nowy)

**Interfaces:**
- Produces: identyfikatory i dane (era 6, `dziala: false`, `odblokowuje: []`, w tej kolejności za `t_siec`):

| id | nazwa PL / EN | dom | lvl | cost | req | inne |
|---|---|---|---|---|---|---|
| `t_fuzja` | Generator fuzji / Fusion generator | `elek` | 4 | 160 | `['t_siec']` | |
| `t_serwer` | Superserwer AI / AI superserver | `it` | 4 | 170 | `['t_fuzja']` | |
| `t_fabryka_bio` | Fabryka biorobotów / Biorobot factory | `bud` | 4 | 200 | `['t_serwer']` | `koncowa: true`, `tryb: 'zwykly'` |
| `t_fabryka_hum` | Fabryka humanoidów / Humanoid factory | `bud` | 4 | 200 | `['t_serwer']` | `koncowa: true`, `tryb: 'zombie'` |

- `t_siec` traci `koncowa`, zostaje z `dzialanie: SIEC` i `dzialanieZombie: SIEC_ZOMBIE`.
- Opisy (`dzialanie`, dokładnie):
  - `t_fuzja`: „Generator fuzji: mała gwiazda w kontenerze po paczkomacie. Prąd dla serwera i fabryki.” / “Fusion generator: a small star in an old parcel-locker container. Power for the server and the factory.”
  - `t_serwer`: „Superserwer AI z dawnego centrum danych. Sam pisze sobie regulamin, ale fabrykę poprowadzi.” / “An AI superserver from an old data centre. It writes its own terms of service, but it will run the factory.”
  - `t_fabryka_bio`: „Fabryka biorobotów odpornych na bakterię miedzi. Bioroboty położą nowe linie w całym mieście.” / “A factory of biorobots immune to the copper bacterium. They will lay new lines across the whole city.”
  - `t_fabryka_hum`: „Fabryka humanoidalnych żołnierzy. Wyjdą z bramy i oczyszczą miasto ze szwendaczy.” / “A factory of humanoid soldiers. They will march out of the gate and clear the city of walkers.”
- `export function siecZbadana(st: SimState): boolean`: `t_siec` w `st.techDone`.
- `koncowaZbadana(st)`: `true` tylko dla technologii z `koncowa`, której `tryb` nie ma albo równa się `modeOf(st)`.

- [ ] **Step 1: Testy, które padają** (`tests/unit/badania-fabryka.test.ts`): cztery nowe identyfikatory w `TECHS` zaraz za `t_siec` i w tej kolejności, każdy z danymi z tabeli i z kosztem `kosztTech` 480, 510, 600, 600; dokładnie dwie technologie z `koncowa` (obie fabryki, z trybem jak w tabeli), `t_siec` bez `koncowa`; tablica w zwykłej grze ma kartkę `t_fabryka_bio` i nie ma `t_fabryka_hum`, w zombie odwrotnie, w obu dokładnie jedna `.tb-cel`; `koncowaZbadana` przy `techDone` = `['t_siec']` fałsz, w zwykłej z `t_fabryka_bio` prawda, w zwykłej z `t_fabryka_hum` fałsz, w zombie z `t_fabryka_hum` prawda; `siecZbadana` z `t_siec` prawda; menu pracowni ma „Włączyć sieć” przy zbadanej sieci bez fabryki, a polecenie `siec` ustawia `research.siec`; nazwy angielskie wszystkich czterech.
- [ ] **Step 2: Uruchomić** `npm test -- badania-fabryka`: pada.
- [ ] **Step 3: Zmiany w danych i warunkach** według Interfaces (sieć w menu i w `wlaczSiec` przez `siecZbadana`). Opis układu tablicy w nagłówku `src/ui/badania.ts` tylko, jeśli zmienia się zachowanie.
- [ ] **Step 4: Przypięcia** z listy Files: 29 technologii w `TECHS` (w każdym trybie 28 na tablicy), jedna złota kartka na tryb, `dzialanieZombie` dalej tylko przy `t_siec`, szerokość tablicy 1106 px bez zmian, liczba kartek w `tools/shots.ts` liczona dla trybu.
- [ ] **Step 5: Sprawdzenie:** `npm test -- badania`, `npm run build`, `npm run lint`, `npm run bot` i `npm run bot:zombie` (skróty jak w Global Constraints). Nowy scenariusz `badania-tablica-zombie` (to samo co `badania-tablica`, w trybie zombie). `npm run shots -- badania-tablica`, obejrzeć `badania-tablica.png`, `badania-tablica-1024.png` i `badania-tablica-zombie.png`: w kolumnie ery 6 sieć, generator, serwer i złota fabryka bieżącego trybu jedna pod drugą, nic nie nachodzi.
- [ ] **Step 6: Commit** „Badania: generator fuzji, superserwer AI i fabryka jako cel drzewa”.

### Task 2: Droga technologii w ramie zwycięstwa

**Files:**
- Modify: `src/gov/zwyciestwo.ts` (`DROGI.technologia`, `spelnione`, `wkrotceDrogi`, `dalejDrogi`, `WKROTCE.technologia`, nagłówek)
- Modify: `src/gov/typy.ts` (`GovInput.badania` dostaje opcjonalne `fabryka?: boolean`: fabryka uruchomiona, etap 2; dziś nikt go nie ustawia)
- Modify: `src/ui/zwyciestwo.ts` (`epilogTekst` dla `technologia` w obu trybach)
- Modify: przypięcia w `tests/unit/zwyciestwo.test.ts` (:128-138, :142-157, :168-232, :372-379, :924, :947) i `tests/unit/zwyciestwo-ui.test.ts` (:131, :188, :329, :489)
- Test: `tests/unit/zwyciestwo-technologia.test.ts` (nowy)
- Modify: `tools/shots.ts` (epilog technologii w obu trybach przez `zm.wygraj('technologia')`)

**Interfaces:**
- Consumes: `GovInput.badania` (`pracownia`, `zbadane`, `era`, `koncowa`, `siecWlaczona`) i `GovInput.techDone` (identyfikator `t_fuzja` z Task 1).
- Kamienie `DROGI.technologia` (sześć, dokładnie): „Pracownia postawiona” / “Research room built”; „Pierwsze badanie” / “First research”; „Era 3” / “Era 3”; „Sieć bez miedzi” / “Copper-free grid”; „Generator fuzji” / “Fusion generator”; „Fabryka ruszyła” / “The factory is running”.
- `spelnione('technologia', i)`: bez `i.badania` 0; dalej po kolei: 1, gdy `pracownia` albo `zbadane > 0`; 2, gdy `zbadane >= 1`; 3, gdy `era >= 3`; 4, gdy `siecWlaczona`; 5, gdy `techDone` zawiera `t_fuzja` (w etapie 2 zamiast tego postawiony generator); 6, gdy `i.badania.fabryka === true`.
- „Wkrótce” technologii: bez `i.badania` stary tekst `WKROTCE.technologia`; z `i.badania` brak przy 0 i 1 zaliczonych, a od 2 „Wkrótce: ery 3–6 czekają na prąd z projektu gospodarki.” / “Coming soon: eras 3–6 are waiting for power from the economy project.”. `wkrotceDrogi` dostaje trzeci argument `maBadania: boolean`; to dalej jedyne miejsce tej reguły.
- „Co dalej” technologii: przy 0 „Postawcie pracownię w pokoju waszego mieszkania (Budowa, zakładka Dom).” / “Build a research room in a room of your flat (Build, Home tab).”; przy 1 „Posadźcie kogoś przy stole pracowni i wybierzcie kartkę na tablicy badań.” / “Sit someone at the research table and pick a card on the research board.”; potem `null`.
- Epilog technologii (`epilogTekst`), zwykły: „Fabryka ruszyła. Bioroboty, których bakteria nie rusza, kładą nowe linie od waszej bramy przez całe miasto, a superserwer liczy, kto pierwszy dostanie prąd.” / “The factory is running. Biorobots the bacterium cannot touch are laying new lines from your gate across the whole city, while the superserver works out who gets power first.”; zombie: „Fabryka ruszyła. Humanoidalni żołnierze wychodzą z bramy i czyszczą miasto ze szwendaczy, kwartał po kwartale, a superserwer pisze im rozkazy i regulamin.” / “The factory is running. Humanoid soldiers march out of the gate and clear the city of walkers, block by block, while the superserver writes their orders and their terms of service.”
- `PostepDrogi.postep` i `seria` dla technologii: `null`.

- [ ] **Step 1: Testy, które padają** (`tests/unit/zwyciestwo-technologia.test.ts`): kamienie z ciągu odczytów (bez `badania` 0; pracownia 1; pierwsze badanie 2; era 3 daje 3; włączona sieć 4; `t_fuzja` w `techDone` 5; `fabryka: true` 6 i zwycięstwo z epilogiem w kolejce); kamienie nie maleją, gdy odczyt spadnie (rozbiórka pracowni); kamienie idą po kolei (`siecWlaczona` bez ery 3 nie daje czwartego); `ocenDrogi` dla technologii: przy 0 i 1 zaliczonych „co dalej” z tekstami wyżej i bez „Wkrótce”, od 2 „Wkrótce” o prądzie i bez „co dalej”, bez `badania` stary „Wkrótce”; epilog w obu trybach w obu językach dokładnie jak wyżej.
- [ ] **Step 2: Uruchomić** `npm test -- zwyciestwo-technologia`: pada.
- [ ] **Step 3: Implementacja** według Interfaces.
- [ ] **Step 4: Przypięcia** z listy Files (sześć kamieni technologii zamiast pięciu, tabela tekstów, epilog technologii zamiast tekstu zastępczego).
- [ ] **Step 5: Sprawdzenie:** `npm test -- zwyciestwo`, `npm test`, `npm run build`, `npm run lint`, `npm run bot`, `npm run bot:zombie`, `npm run bot -- --zwyciestwo` (bez błędu; kamienie technologii u bota bez pracowni mogą zostać na 0). `npm run shots -- zwyciestwo`, obejrzeć ekran dróg (technologia z sześcioma kamieniami i „co dalej” przy braku pracowni) i dwa nowe epilogi.
- [ ] **Step 6: Commit** „Zwycięstwo: droga technologii z odczytu badań i epilog fabryki”.

### Task 3: Dziennik i projekt

Robi integrator, nie wykonawca.
- `docs/POSTEP.md`: wpis w „Zrobione” z bramką, decyzja Mateusza w „Decyzjach” (jego słowa) i moje (łańcuch w erze 6, nazwy, koszty, teksty), w „Następnych” etap 2: budowle generatora i fabryki (miejsce na terenie, koszt, budowa wielodniowa), „Uruchomić fabrykę” z potwierdzeniem, okna nocą po włączeniu sieci w całym terenie, `GovInput.badania.fabryka`, po prądzie z projektu gospodarki.
- Projekt zwycięstwa, sekcja 1: etap 1 zrobiony, etap 2 czeka na prąd.
