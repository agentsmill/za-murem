# Angielska wersja językowa: plan wdrożenia

> **Dla wykonawców:** zadania 1–4 i 10–13 robi sesja `angielski` sama, zadania 5–9 dostają osobni wykonawcy (podagenci w osobnych drzewach od commita z zadaniami 1–4), każdy sprawdzony przed scaleniem. Kroki w formie `- [ ]`.

**Cel:** gra domyślnie po angielsku, polski do wyboru, bez zmiany symulacji i zarządu.

**Architektura:** `src/core/jezyk.ts` trzyma bieżący język, typ `Tx` (tekst w obu językach) i pomocnicze `L()`, `tr()`. Stan symulacji zostaje bez zmian (polskie napisy w nim to identyfikatory, tłumaczone przy rysowaniu), zarząd zapisuje swoje zdania jako `Tx`. Interfejs wybiera język przy rysowaniu i rysuje się od nowa po zmianie.

**Technologia:** TypeScript 7 (wymazywalna składnia), Vite 8, Vitest 5, Playwright, Biome.

**Projekt:** `docs/superpowers/specs/2026-10-18-angielski-design.md`, słowniczek `docs/SLOWNICZEK-EN.md`.

## Zasady wspólne

- Angielski brytyjski i słowa ze słowniczka. Ton: czarny humor, satyra na technologię i ekologię, ludzie sympatyczni; nie tłumaczyć słowo w słowo.
- Imiona, nazwiska i nazwy miejsc zostają polskie. Imion po angielsku nie odmieniamy.
- Polskich tekstów nie zmieniamy (testy i boty je sprawdzają). Wyjątek: błąd w polskim tekście poprawiamy tylko wtedy, gdy test go nie pilnuje, i opisujemy w commicie.
- Na poziomie modułu nie wołamy `L()` ani `jezyk()`: stałe tablice napisów to `Tx` albo `Record<klucz, Tx>`, wybór języka w funkcji, która rysuje.
- Stan symulacji (`SimState`) bez nowych pól i bez zmian napisów. Zarząd (`src/gov`) nie czyta bieżącego języka, tylko składa `Tx`.
- Liczby w tekstach przez `num`, `signed`, `deg`, `pct` z `src/ui/tekst.ts` (rysowanie) albo `liczba(v, cyfry, lang)` z `src/core/jezyk.ts` (zarząd, po obu stronach `tx`).
- Komentarze i nagłówki modułów po polsku, jak w reszcie kodu. Każdy nowy plik zaczyna się komentarzem o tym, co robi.
- Sprawdzanie przed oddaniem zadania: `npm test`, `npx biome check src tests tools server index.html`, `npm run build`.

## Na co uważać przy przeglądzie

1. Zmiana języka w trakcie gry przy otwartym oknie (karta nocy, raport, wydarzenie, Menu, budowa): okno rysuje się od nowa w nowym języku, przydział na karcie nocy zostaje. Test w zadaniu 4 (wiązanie w `main.ts`), sprawdzenie zrzutem w zadaniu 12.
2. Zapis sprzed tej gałęzi (zarząd z polskimi napisami zamiast `Tx`) wczytany po angielsku: gra działa, stare wpisy po polsku. Test w zadaniu 3.
3. Polski tekst bez angielskiego odpowiednika (nowy napis dopisany kiedyś tylko po polsku): pokazuje się po polsku, a test pokrycia go łapie. Testy w zadaniach 2, 3, 6.
4. Ten sam przebieg gry w obu językach, także przy zmianie języka w połowie: test w zadaniu 3.
5. Długie angielskie napisy na telefonie 390×844 (pasek, karta nocy, przyciski budowy): zrzuty w zadaniu 12.

---

### Zadanie 1: Rdzeń języka i liczby

**Pliki:**
- Utwórz: `src/core/jezyk.ts`
- Zmień: `src/ui/tekst.ts`
- Test: `tests/unit/jezyk.test.ts`

**Interfejsy (dla wszystkich dalszych zadań):**
- `type Lang = 'en' | 'pl'`, `LANGS: readonly Lang[] = ['en', 'pl']`
- `interface Tx { readonly pl: string; readonly en: string }`, `tx(pl, en): Tx`, `txSame(s): Tx`, `txCat(...parts: (Tx | string)[]): Tx`, `txJoin(parts: readonly Tx[], sep: string | Tx = ' '): Tx`, `isTx(v: unknown): v is Tx`, `txOf(t: Tx | string): Tx`
- `jezyk(): Lang` (w module domyślnie `'pl'`), `ustawJezyk(l: Lang): void` (woła słuchaczy tylko przy zmianie), `poZmianieJezyka(f: (l: Lang) => void): () => void`
- `L(pl: string, en: string): string`, `tr(t: Tx | string | null | undefined): string` (`''` dla braku)
- `liczba(v: number, cyfry: number, lang: Lang): string` (pl: przecinek, en: kropka, oba: prawdziwy minus)
- `src/ui/tekst.ts`: `num`, `signed`, `deg`, `pct` jak dziś, ale według `jezyk()`; nowe `many(n: number, one: string, other: string): string` („1 person”, „2 people”)

- [ ] Test: `tr(tx('Pauza', 'Pause'))` daje `'Pauza'`, po `ustawJezyk('en')` daje `'Pause'`; `tr('stary')` daje `'stary'` w obu; `num(1.5)` daje `'1,5'` po polsku i `'1.5'` po angielsku, `signed(-2)` daje `'−2'`; `many(1, 'person', 'people')` daje `'1 person'`, `many(0, …)` daje `'0 people'`; słuchacz z `poZmianieJezyka` woła się raz przy zmianie i wcale przy tym samym języku; `txJoin([tx('a','A'), tx('b','B')], tx(' i ', ' and '))` daje `{pl: 'a i b', en: 'A and B'}`. Po teście `ustawJezyk('pl')` (w `afterEach`).
- [ ] Uruchom `npm test -- jezyk`: porażka (brak modułu).
- [ ] Napisz moduł i zmiany w `tekst.ts`.
- [ ] `npm test -- jezyk` przechodzi, `npm test` cały przechodzi bez zmian w innych testach.
- [ ] Commit.

### Zadanie 2: Wspólne słowniki napisów ze stanu

**Pliki:**
- Utwórz: `src/content/data.en.ts`, `src/content/nastroje.en.ts`
- Test: `tests/unit/slowniki-en.test.ts`

**Interfejsy:**
- `data.en.ts`: `DOM_EN: Record<Dom, string>`, `RL_EN: Record<Res, string>`, `SEASONS_EN: readonly string[]`, `TRAITS_EN: Record<string, { name: string; desc: string }>` (te same klucze co `TRAITS`), `PROFS_EN: Record<string, string>` (klucz: męska nazwa z `PROFS`), `zawodEn(prof: string): string` (przyjmuje męską albo żeńską polską nazwę z `PROFS` i nazwy z rejestru `ZAWODY_EN`; nieznana zostaje), `ZAWODY_EN: Map<string, string>` (rejestr, do którego inne moduły dopisują swoje zawody, np. generator mieszkańców), `LORE_EN`, `LORE_ZOMBIE_EN`, `przyczynaEn(cause: string): string` (`rany`, `gorączka`, `amputacja`, reszta bez zmian)
- `nastroje.en.ts`: `nastrojEn(why: string): string` (dokładne napisy z tablicy i wzorce dla `Śmierć: …`, `Spalili …`; nieznany zostaje), `NASTROJE_EN: Readonly<Record<string, string>>`

- [ ] Test: każdy klucz `TRAITS`, `DOM`, `RL`, każda męska i żeńska nazwa z `PROFS` ma angielski odpowiednik bez polskich znaków; każdy powód nastroju zapisany w kodzie literałem (`addMood(…, '…'`, `moodAll('…'`, `why: '…'` przy `moods.push`, `FEVER_MOOD`, oba warianty z `g(p, …)` w `src/gov/noc.ts`) ma wpis w `NASTROJE_EN` (test czyta źródła z `src/` i zbiera literały wyrażeniem regularnym); `nastrojEn('Śmierć: Ania')` daje `'Death: Ania'`; `nastrojEn('Spalili moją wersalkę')` daje angielskie zdanie z „sofa bed”.
- [ ] Uruchom: porażka.
- [ ] Napisz tablice (słowa ze słowniczka, ton z zasad).
- [ ] Test przechodzi. Commit.

### Zadanie 3: Zarząd w obu językach

**Pliki:**
- Zmień: `src/gov/typy.ts`, `wspolne.ts`, `zarzad.ts`, `noc.ts`, `uchwaly.ts`, `miejsce.ts`, `tresc.ts`, `ulica.ts`, `wydarzenia.ts`, `src/ui/siatka.ts` (nazwy dziur jako `Tx`), testy zarządu (`zarzad*.test.ts`, `night.test.ts`, `wydarzenia-miejsce.test.ts`, `miejsce-teksty.test.ts`, `racje.test.ts`, `przyjecia.test.ts`, `pierwszy-dzien.test.ts`, `swiatlo-czuwanie.test.ts`, `gov-play.ts`, `gov-atrapa.ts`), boty i `tools/trzy-noce.ts` (wypisują `.pl`)
- Utwórz: `src/gov/tresc.en.ts` (uchwały M1, cele wypraw, nazwy dziur, zakończenia przy domu), `src/gov/warianty.en.ts` (szkielet: typ `EventEn` i pusta `EVENTS_EN`, treść w zadaniu 6)
- Test: `tests/unit/zarzad-jezyk.test.ts`

**Interfejsy:**
- Pola `Tx` w stanie i wyjściu zarządu: `GovState.log[].txt`, `NightPlan.lines`, `NightReport.lines`, `GovState.later[].line`, `GovEffects.log`, `NightCard.chanceWord | forecast | advice`, `NightCard.posts[].name`, `NightCard.horde.word`, `NightOption.label | why | note`, `RaidPlan.where`, `RaidResult.where`, `LawOption.name | desc | why`, `Prompt` `wydarzenie`: `title | text | choices[].label`, `GovHole.name` (wejście). `nightAdvice()` zwraca `Tx`. `GovMood.why` zostaje polskim napisem.
- `logGov(st, i, txt: Tx, big?, fx?)`; `GovHost.log(txt: string | Tx, big?)` (napis: wpis z 0.3, tłumaczony przez `EVENTS_EN[id].log`); `GovHost.later(stock, line: Tx)`; `GovHost.wordsEn(): WordsEn`; `GovHost.neighbourEn(): string | null`.
- `miejsce.ts`: `interface WordsEn { wspolnota; zarzad; Zarzad; krotko; walne; naglowek; mieszkancy; brama; sasiad }` (wartości ze słowniczka, z rodzajnikiem: „the co-op”, „the board”), `wordsEn(p: GovPlace): WordsEn`.
- `GEventDef.title | text: (h, d) => Tx`, `choices: (h, d) => GChoice[]`, `GChoice = { label: Tx; ok: boolean; ai?: boolean; run(): void }`.
- `warianty.en.ts`: `interface EventEn<D> { title(h, d): string; text(h, d): string; labels(h, d, pl: readonly string[]): string[]; log?(pl: string, h, d, k: number): string | null }`, `EVENTS_EN: Record<string, EventEn>`. Brak wpisu: angielska strona `Tx` dostaje polski tekst.
- `normalizujTeksty(st: GovState): GovState` w `zarzad.ts`: stare polskie napisy w polach `Tx` zamienia na `txOf(napis)`; woła je `loadGov` i start gry z zapisu.

- [ ] Test `zarzad-jezyk.test.ts`: (a) dwie gry z tym samym ziarnem przez `playWithGov` z `gov-play.ts`, jedna z `ustawJezyk('en')` w połowie, dają ten sam `saveGov` i ten sam `sim.hash()`; (b) po trzech dobach każdy `Tx` w kronice, raportach i karcie nocy ma niepusty `en`, a `en` bez polskich znaków poza imionami osób i nazwą siedziby; (c) zapis zarządu z polskimi napisami (`txt: 'Karta nocy. …'`, `lines: ['…']`, karta z napisami) po `normalizujTeksty` ma `Tx` z tym samym tekstem po obu stronach, a `pending()` i okna działają.
- [ ] Uruchom: porażka.
- [ ] Przerób typy i zarząd; angielskie zdania pisz obok polskich (`tx(pl, en)`), warianty jako pary wybierane tym samym losowaniem.
- [ ] Popraw testy zarządu na `.pl` (treść oczekiwań bez zmian).
- [ ] `npm test`, Biome, `npm run build` przechodzą; `npm run bot` daje te same skróty co przed zmianą (da4b24e0, dad44c81), `npm run bot:zombie` też (4873d659, 34dd5c5f).
- [ ] Commit.

### Zadanie 4: Wybór języka, przełącznik i `main.ts`

**Pliki:**
- Utwórz: `src/ui/jezyk.ts`
- Zmień: `index.html` (angielskie napisy bazowe, miejsce na przełącznik `#langStart`), `src/main.ts` (start języka przed rysowaniem, słuchacze, wszystkie napisy `main.ts`), `src/style.css` (przełącznik), `tools/shots.ts` (parametr `lang` w scenariuszach)
- Test: `tests/unit/jezyk-ui.test.ts`

**Interfejsy:**
- `JEZYK_KEY = 'za-murem-0.4-jezyk'`
- `wybierzJezyk(param: string | null, zapisany: string | null): Lang` (poprawny `param` wygrywa, potem poprawny zapisany, potem `'en'`)
- `startJezyka(o?: { params?: URLSearchParams; store?: Store | null }): Lang` (ustawia język, `<html lang>`, napisy statyczne)
- `zmienJezyk(l: Lang, store?): void` (zapis w pamięci, `ustawJezyk`, napisy statyczne, usuwa `lang` z adresu przez `history.replaceState`)
- `STATYCZNE: readonly { sel: string; tekst?: Tx; title?: Tx; aria?: Tx; placeholder?: Tx; html?: Tx }[]`, `nalozStatyczne(root?: ParentNode): void`
- `przelacznikHtml(): string` (dwa przyciski `data-lang` z `aria-pressed`), `podepnijPrzelacznik(el: HTMLElement): void`
- `main.ts`: po zmianie języka rysuje od nowa kartę startową (wstęp, przykłady, wznowienie, panel drużyny, panel sieci, status) albo w grze pasek, cele, kartę osoby, otwarte okno (to samo okno z tym samym stanem, karta nocy z bieżącym przydziałem), budowę i znacznik drzewa; menu pod prawym przyciskiem zamyka.

- [ ] Test: `wybierzJezyk(null, null)` to `'en'`, `wybierzJezyk('pl', 'en')` to `'pl'`, `wybierzJezyk('de', 'pl')` to `'pl'`, `wybierzJezyk(null, 'xx')` to `'en'`; `startJezyka` z atrapą pamięci nie zapisuje parametru; `zmienJezyk('pl', atrapa)` zapisuje `'pl'` pod `JEZYK_KEY`; każdy selektor z `STATYCZNE` istnieje w `index.html`, a każdy `Tx` ma oba teksty.
- [ ] Uruchom: porażka.
- [ ] Napisz moduł, przełącznik, wiązanie w `main.ts` i angielskie napisy `main.ts`.
- [ ] Testy, Biome, build. Ręcznie: `npm run shots -- start` i `-- m1-menu` (EN), obejrzane.
- [ ] Commit, potem start wykonawców zadań 5–9 od tego commita.

### Zadania 5–9: tłumaczenie grup plików (wykonawcy równolegle)

Każdy wykonawca dostaje: ten plan, projekt, słowniczek, listę swoich plików (tylko je zmienia), interfejsy z zadań 1–4. Każdy dopisuje test `tests/unit/<grupa>-en.test.ts`, który z `ustawJezyk('en')` rysuje swoje teksty na atrapach z istniejących testów i sprawdza brak polskich znaków poza imionami i nazwami miejsc. Polskie testy jego plików przechodzą bez zmian. Commit na własnej gałęzi, bez pusha.

- **Zadanie 5 (interfejs A):** `src/ui/okna.ts`, `pasek.ts`, `przybycie.ts`, `cele.ts`, `budowa.ts`, `mieszkania.ts`, `znacznik.ts`, `src/sim/budowle.ts`, `src/sim/mieszkania.ts` (napisy do rysowania).
- **Zadanie 6 (wydarzenia z 0.3 i treść 0.3):** `src/gov/warianty.en.ts` (wszystkie wydarzenia z `OLD_EVENTS` z nakładkami), w `src/content/data.en.ts` dopisane `LAW_EN`, `PATHS_EN`, `ENDINGS_EN`. Test: każde wydarzenie z `OLD_EVENTS` z każdym wyborem na 30 ziarnach daje angielski tytuł, tekst, napisy i każdy wpis do kroniki ma tłumaczenie.
- **Zadanie 7 (interfejs B):** `src/ui/karta.ts`, `menu.ts`, `okno.ts`, `zapis.ts`, `imiona.ts`, `src/sim/orders.ts`, `needs.ts`, `bron.ts`, nazwy rzeczy do rysowania w `src/sim/sim.ts` (`FURNITURE_ACC`, `THING_ACC`, `ROOM_ACC` i podobne: bez zmian w samych polskich tablicach, angielskie obok), `src/world/load.ts`, `world.ts`, `osm.ts` (komunikaty dla gracza).
- **Zadanie 8 (drużyna i sieć):** `src/ui/druzyna.ts`, `src/content/druzyna.ts` (nazwy do rysowania), `src/content/historia.en.ts` (historie drużyny tym samym losowaniem), `src/ui/siec.ts`, `src/net/gra.ts`, `siec.ts`, `api.ts`, `protokol.ts` (komunikaty dla gracza, błędy serwera po kodzie).
- **Zadanie 9 (mieszkańcy z adresu):** `src/mieszkancy/*.en.ts` (szablony z identyfikatorami i angielskimi bliźniakami, kierunki, fachy i zawody dopisane do `ZAWODY_EN`, rodzina), funkcja `lokatorzyEn(l: LokatorzyGry, dane: DaneMieszkancow, imiona: ReadonlyMap<string, string>): Map<string, { story?: string; rodzina: string; prof: string }>` w `src/mieszkancy/angielski.ts`; bez zmian w polskich historiach (testy generatora przechodzą bez zmian).

### Zadanie 10: Scalenie wykonawców i karta osoby z generatora

- [ ] Scal gałęzie zadań 5–9 po przeglądzie (ton, słowniczek, brak zmian w polskich tekstach, testy).
- [ ] Karta osoby po angielsku bierze historię, rodzinę i zawód z mapy `lokatorzyEn` (liczonej w `main.ts` przy starcie i po zmianie imion), bez niej polskie ze stanu.
- [ ] `npm test`, Biome, build, boty. Commit.

### Zadanie 11: Wciągnięcie `pelna-gra`

- [ ] `git merge pelna-gra` (po scaleniu sesji zombie), konflikty rozwiązane z zachowaniem obu stron.
- [ ] Nowe napisy z sesji zombie po angielsku (`git diff` od wspólnego przodka, literały z polskimi znakami).
- [ ] `npm test`, Biome, build, boty: skróty jak w `pelna-gra` po scaleniu. Commit.

### Zadanie 12: Zrzuty w obu językach

- [ ] W `tools/shots.ts` scenariusze `en-*` i `pl-*`: karta startowa, pasek, karta osoby, karta nocy, raport, na komputerze i na telefonie 390×844.
- [ ] `npm run shots`, każdy nowy zrzut obejrzany (długie napisy, ucięcia, mieszanie języków). Poprawki i commit.

### Zadanie 13: Dziennik i oddanie

- [ ] Wpis w `docs/POSTEP.md` („Zrobione”, „Decyzje”, „Co jeszcze po polsku”), przegląd całej gałęzi przez świeżego recenzenta, poprawki, commit do scalenia przez koordynatora.
