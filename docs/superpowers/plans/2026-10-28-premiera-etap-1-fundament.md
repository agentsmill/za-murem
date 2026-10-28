# Premiera, etap 1: fundament (hosting, sieć od pierwszego wejścia, liczenie) — plan budowy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gra stoi na darmowym Vercelu z `/api` przekazywanym na serwer na Hetznerze, gra sieciowa rusza bez formularza (anonimowa drużyna z kodem powrotu), klatki i konta wygasają, zapytania o klatki są zawężone do własnej okolicy, adresy szukamy przez nasz serwer, a serwer liczy graczy bez identyfikatora.

**Architecture:** Serwer (`server/`) dostaje nowe trasy i dwie migracje bazy, bez zależności z npm. Wyszukiwanie adresów to osobny moduł `server/adres.ts` z kolejką do Nominatim, Photonem w zapasie i pamięcią w procesie. Klient (`src/net/api.ts`, `src/net/gra.ts`, `src/ui/siec.ts`) traci formularz logowania na rzecz drużyny zakładanej przy pierwszej grze; przełącznik `?siec=1` zastępuje jedna funkcja z flagą builda `VITE_SIEC`. Vercel (`vercel.json`, sekcja `routes`) przekazuje `/api/*` pod adres ze zmiennej `ZM_API` (inna dla produkcji, inna dla podglądów) i dokleja tajny nagłówek ze zmiennej `ZM_PROXY_SEKRET`. Symulacji nie ruszamy.

**Tech Stack:** TypeScript 7 (`verbatimModuleSyntax`, `erasableSyntaxOnly`), Node 24 (`node:http`, `node:sqlite`, `node:crypto`, globalny `fetch`), Vite 8, Vitest, Playwright, Biome, Vercel (plan Hobby), Docker Compose na `cergo-rw-prod`.

**Spec:** `docs/superpowers/specs/2026-10-28-wyjscie-na-swiat-design.md`, części 1, 2 i 6 oraz punkt 2 kolejności budowy. Tło: `docs/superpowers/specs/2026-10-18-multiplayer-design.md` (model asynchroniczny, klucze klatek), `server/README.md`, `deploy/hetzner/README.md`.

Kolejne etapy dostaną osobne plany, kiedy ten etap ustali nazwy w API: etap 2 drużyny na mapie miasta (część 3), etap 3 krótkofalówka i handel (części 4 i 5), etap 4 samouczek (część 7), etap 5 film (część 8).

## Global Constraints

- Nic na zewnątrz bez wyraźnego OK Mateusza w rozmowie: założenie projektu na Vercelu i podpięcie repo, zmienne środowiskowe na Vercelu, wdrożenie na `cergo-rw-prod`, zmiana Caddyfile cergo, push na `main`. Lokalne commity swobodnie.
- Sekrety (`ZM_PROXY_SEKRET`, `ZM_LICZNIKI_TOKEN`, `ZM_KONTAKT`) tylko w zmiennych środowiskowych Vercela i w `.env` na serwerze, nigdy w repo ani w logach.
- Gra bez serwera (GitHub Pages, dema offline, serwer leży) działa jak dziś: każde nowe wywołanie API ma zapas bez błędu na ekranie i bez pętli ponowień.
- Symulacja nietknięta: przed zadaniem 1 zapisz skróty `npm run bot` i `npm run bot:zombie` na tej gałęzi; na końcu etapu mają być te same.
- Wartości ze specu: klatka wygasa po 14 dniach bez gry, konto po 180 dniach, kopie bazy zostają 7 dni (bez zmian), znacznik i reszta mapy to etap 2.
- Serwer nie zapisuje adresów IP ani tekstu zapytań o adres (także w dzienniku błędów); pamięć wyników adresów tylko w procesie, kluczem jest skrót SHA-256 znormalizowanego zapytania.
- Serwer: Node 24 bez zależności z npm; nowa wersja schematu to nowy wpis w `MIGRACJE` w `server/baza.ts`; zmiana tras to też zmiana komentarza na górze `server/app.ts` i opisu w `server/README.md`.
- Produkcja na Vercelu buduje się bez `VITE_SIEC`, dopóki Mateusz nie zatwierdzi informacji o danych osobowych (zadanie 12); podglądy gałęzi z `VITE_SIEC=1`.
- Teksty po polsku i po angielsku (`L`, `tx` z `src/core/jezyk.ts`), liczby w tekstach przez `src/ui/tekst.ts`, komentarze po polsku, nagłówek każdego nowego pliku opisuje kontrakt, commity po polsku ze stopką `Co-Authored-By`.
- Lint: `npx biome check src tests tools server index.html` (nie `npm run lint` w drzewie z `.claude/worktrees/`).

## Review Focus

1. Zgubione ciasteczko (przeglądarka w aplikacji Reddita, karta prywatna, drugie urządzenie): kod powrotu wraca do tej samej drużyny, jej klatek i zapisu z chmury, a sesja na pierwszym urządzeniu działa dalej. Test w zadaniu 2 (serwer) i 9 (gra).
2. Serwer odpowiada 503 albo nie odpowiada przy zakładaniu drużyny: gra startuje bez sieci z jednym komunikatem, `druzyna()` wołane raz na start. Test w zadaniu 9.
3. Wiele osób za jednym adresem IP (sieć komórkowa, akademik): dwadzieścia drużyn i dwadzieścia zapytań o adres w kwadrans z jednego IP przechodzą. Testy w zadaniach 2 i 6.
4. Powrót po 15 dniach: klatka wygasła; wolna zajmuje się po cichu przy wczytaniu, zajęta daje jeden komunikat i gra toczy się dalej. Test w zadaniu 3.
5. Ten sam adres wpisany inaczej („Obrońców Wybrzeża 4, Gdańsk” i „  obrońców  wybrzeża 4,  GDAŃSK ”) trafia w tę samą pamięć; adres, którego nie ma, daje jeden czytelny błąd i przeglądarka nie pyta już sama Nominatim. Testy w zadaniach 6 i 8.

---

### Zadanie 1: Serwer za Vercelem: sekret proxy i źródła z gwiazdką

**Files:**
- Modify: `server/app.ts` (`OpcjeSerwera`, `ipZ`, `obceZrodlo`, `zdrowie`, komentarz na górze)
- Modify: `server/main.ts` (zmienne `ZM_PROXY_SEKRET`, `ZM_PROXY_IP`)
- Modify: `src/net/protokol.ts` (`Zdrowie`)
- Modify: `server/README.md` (tabela zmiennych)
- Test: `tests/unit/serwer-proxy.test.ts`

**Interfaces:**
- Produces: `NAGLOWEK_PROXY = 'x-zm-proxy'` (eksport z `server/app.ts`); `OpcjeSerwera.proxySekret?: string`, `OpcjeSerwera.proxyNaglowekIp?: string` (domyślnie `'x-real-ip'`); `pasujeZrodlo(origin: string, wzory: readonly string[]): boolean` (eksport z `server/app.ts`); `Zdrowie.ip?: 'proxy' | 'xff' | 'polaczenie'`.

- [ ] **Krok 0: Zapisz skróty botów przed zmianami**: `npm run bot` i `npm run bot:zombie`, skróty wpisz do notatki zadania; porównasz je w zadaniu 14.
- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('z dobrym sekretem adres klienta z x-real-ip: dwóch klientów za tym samym proxy ma osobne limity', ...)
  // serwerTestowy({ proxySekret: 's3kret' }); 300 żądań /api/zdrowie z x-zm-proxy: s3kret i x-real-ip: 10.0.0.1 → 301. to 429
  // to samo z x-real-ip: 10.0.0.2 → 200
it('bez sekretu albo ze złym sekretem nagłówek x-real-ip się nie liczy', ...)
  // zły sekret, różne x-real-ip: wspólny limit połączenia (301. żądanie 429)
it('zdrowie mówi, skąd serwer wziął adres klienta, bez samego adresu', ...)
  // z dobrym sekretem ip === 'proxy'; bez niego 'polaczenie'; z zaufaneProxy i X-Forwarded-For 'xff'
it('źródło z gwiazdką przepuszcza podgląd gałęzi i nic poza nim', ...)
  // pasujeZrodlo('https://zamurem-git-druzyna-mateuszs-projects-73382f2a.vercel.app', ['https://zamurem-*-mateuszs-projects-73382f2a.vercel.app']) === true
  // 'https://zly.vercel.app' → false; 'https://zamurem-a.b-mateuszs-projects-73382f2a.vercel.app' (kropka w gwiazdce) → false
  // 'https://zamurem.vercel.app' przy wzorze bez gwiazdki → true
```

- [ ] **Krok 2: Uruchom** `npm test -- serwer-proxy`, oczekiwane: FAIL (brak `pasujeZrodlo`, brak pola `ip`).
- [ ] **Krok 3: Zaimplementuj.** Sekret porównuj w stałym czasie (`timingSafeEqual` na skrótach SHA-256 obu napisów). Gwiazdka we wzorze to jeden kawałek nazwy hosta `[a-z0-9-]+`, reszta wzoru dosłownie. `obceZrodlo` używa `pasujeZrodlo`, gdy lista źródeł nie jest pusta. W `server/main.ts` `proxySekret: env.ZM_PROXY_SEKRET || undefined`, `proxyNaglowekIp: env.ZM_PROXY_IP || 'x-real-ip'`. `Cache-Control: no-store` już jest w `NAGLOWKI` w `server/http.ts`: dopisz do testu sprawdzenie, że odpowiedź `/api/zdrowie` go ma.
- [ ] **Krok 4: Uruchom** `npm test -- serwer`, oczekiwane: PASS (nowe i stare testy serwera).
- [ ] **Krok 5: Commit** `git commit -m "Serwer za Vercelem: sekret proxy, adres klienta z nagłówka, źródła z gwiazdką"`

### Zadanie 2: Drużyna anonimowa i kod powrotu na serwerze

**Files:**
- Modify: `server/baza.ts` (migracja 2, `Konto`, nowe zapytania, komentarz na górze)
- Modify: `server/hasla.ts` (`nowyKod`)
- Modify: `server/app.ts` (trasy `/api/druzyna`, `/api/druzyna/kod`, `/api/druzyna/powrot`, `usunKonto`, `ja`, limit `druzyny`)
- Modify: `src/net/protokol.ts` (`Ja`, `KOD_ALFABET`, `normalizujKod`, kody błędów)
- Test: `tests/unit/serwer-druzyna.test.ts`

**Interfaces:**
- Consumes: `skrotTokenu` z `server/hasla.ts`.
- Produces:
  - migracja 2: `ALTER TABLE konta ADD COLUMN anonimowe INTEGER NOT NULL DEFAULT 0; ALTER TABLE konta ADD COLUMN kod TEXT; CREATE UNIQUE INDEX konta_kod ON konta(kod) WHERE kod IS NOT NULL;`
  - `Konto.anonimowe: boolean`, `Konto.kod: string | null` (skrót kodu)
  - `Baza.dodajDruzyne(teraz: number): Konto` (nick `''`, `nick_klucz` `'#'` + `nowyToken()`, hasło `''`, `anonimowe = 1`), `Baza.ustawKod(id: number, skrot: string): void`, `Baza.kontoPoKodzie(skrot: string): Konto | null`
  - `nowyKod(): string`: 12 znaków z `KOD_ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` w postaci `XXXX-XXXX-XXXX`
  - `normalizujKod(s: string): string | null` w `src/net/protokol.ts`: bez spacji i myślników, wielkie litery, dokładnie 12 znaków z alfabetu, inaczej `null`
  - `Ja`: `nick: string | null`, `anonimowe: boolean`, `znak: string` (nick konta z nickiem, `'#' + id` drużyny anonimowej), `kod: boolean` (czy drużyna ma kod)
  - trasy: `POST /api/druzyna` → 201 `Ja` + ciasteczko (z ważną sesją: 200 `Ja` tej sesji, bez nowego konta); `POST /api/druzyna/kod` → 200 `{ kod: string }` (nowy kod, stary przestaje działać; sesja wymagana); `POST /api/druzyna/powrot` `{ kod }` → 200 `Ja` + ciasteczko, zły kod 401 `zly_kod`; `DELETE /api/konto` dla drużyny anonimowej bez hasła
  - nowe `KodBledu`: `'zly_kod'`

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('POST /api/druzyna zakłada drużynę bez nicku i loguje; drugi raz z tą samą sesją nie zakłada nowej', ...)
  // 201, Ja { nick: null, anonimowe: true, znak: /^#\d+$/, kod: false, klatki: 0, zapis: false }; drugi POST z ciasteczkiem → 200 i ten sam znak
it('dwadzieścia drużyn z jednego IP w kwadrans przechodzi, trzydziesta pierwsza w godzinę dostaje 429', ...)
it('kod powrotu: nowy kod działa w drugiej przeglądarce, stary po wymianie już nie; pierwsza sesja działa dalej', ...)
  // kod pasuje do /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
  // powrot({ kod: kod.toLowerCase().replaceAll('-', ' ') }) → 200 i ten sam znak, klatki i zapis
  // po drugim POST /kod pierwszy kod → 401 zly_kod; ciasteczko pierwszej przeglądarki → GET /api/konto 200
it('zły kod liczy się do limitu nieudanych prób z IP (10 na 15 minut), dobry nie', ...)
it('w bazie jest tylko skrót kodu, a logowanie nickiem nie trafia w drużynę anonimową', ...)
  // SELECT kod FROM konta ≠ kod i ≠ normalizujKod(kod); POST /api/sesja { nick: '#1', haslo: '' } → 400 albo 401
it('drużyna anonimowa usuwa się bez hasła; konto z nickiem dalej wymaga hasła', ...)
it('normalizujKod: małe litery, spacje i myślniki przechodzą, 0, O, 1, I i zła długość nie', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- serwer-druzyna`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.** Nowe okno limitu `druzyny = okno(30, GODZ, teraz)` na IP; `powrot` liczy się do `logowania` tak jak złe hasło (doliczone przed `await`, oddane, gdy kod był dobry). Skrót kodu to `skrotTokenu(normalizujKod(kod))`. `ja()` liczy `znak` i `kod` z `Konto`. Klient gry używa dziś `Ja.nick` jako napisu: zmiana typu na `string | null` sprawdza `tsc`, a poprawki w kliencie robi zadanie 9 (do tego czasu `nick ?? ''` w `src/net/gra.ts`, żeby build przechodził).
- [ ] **Krok 4: Uruchom** `npm test -- serwer api-klient siec`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Serwer: drużyna anonimowa, kod powrotu, usunięcie bez hasła"`

### Zadanie 3: Wygasanie klatek i kont

**Files:**
- Modify: `server/baza.ts` (`zwolnijKlatkiNieaktywnych`, `usunNieaktywneKonta`)
- Modify: `server/app.ts` (`OpcjeSerwera.klatkiDni`, `kontaDni`, `sprzataj`)
- Modify: `server/main.ts` (`ZM_KLATKI_DNI`, `ZM_KONTA_DNI`), `server/README.md`
- Test: `tests/unit/serwer-wygasanie.test.ts`, `tests/unit/siec.test.ts`

**Interfaces:**
- Produces: `Baza.zwolnijKlatkiNieaktywnych(granica: number): number` (klatki kont z `ostatnio < granica`), `Baza.usunNieaktywneKonta(granica: number): number` (kaskadą sesje, klatki, zapis); `OpcjeSerwera.klatkiDni?: number` (14), `OpcjeSerwera.kontaDni?: number` (180); stałe `KLATKI_DNI = 14`, `KONTA_DNI = 180` eksportowane z `src/net/protokol.ts` (czyta je też informacja o danych w zadaniu 12).

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('klatki drużyny bez wizyty przez 14 dni wracają do wolnych, a konto i zapis zostają', ...)
  // zajmij, czekaj(15 * DOBA), gra.sprzataj() → GET /api/klatki innego konta nie widzi klatki; kod powrotu dalej loguje
it('drużyna, która grała 13 dni temu, zachowuje klatki', ...)
it('konto bez wizyty przez 180 dni znika z sesjami i zapisem', ...)
it('sprzątanie wygasłych rusza najwyżej raz na godzinę, sesje co wywołanie', ...)
// tests/unit/siec.test.ts, w bloku GraSieciowa:
it('wczytana gra po wygaśnięciu: wolna siedziba zajmuje się po cichu, zajęta daje jeden komunikat i gra idzie dalej', ...)
```

Jeśli w `tests/unit/siec.test.ts` jest już test na `poWczytaniu` z zajętą siedzibą, dopisz tylko przypadek wolnej siedziby po wygaśnięciu.

- [ ] **Krok 2: Uruchom** `npm test -- serwer-wygasanie siec`, oczekiwane: FAIL na serwerze.
- [ ] **Krok 3: Zaimplementuj** zapytania i sprzątanie (granica `teraz - dni * DOBA`; pamiętaj, że `ostatnio` ma dokładność doby).
- [ ] **Krok 4: Uruchom** `npm test -- serwer siec`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Serwer: klatki wygasają po 14 dniach bez gry, konta po 180"`

### Zadanie 4: Zapytania o zajęte klatki tylko w swojej okolicy

**Files:**
- Modify: `server/app.ts` (`klatkiWProstokacie`, trasa `PUT /api/druzyna/start`, pamięć punktów startu)
- Modify: `src/net/protokol.ts` (`ZASIEG_ZAPYTAN_M`, kody błędów)
- Modify: `tests/unit/serwer.test.ts` (stare testy prostokąta podają punkt startu)
- Test: `tests/unit/serwer-okolica.test.ts`

**Interfaces:**
- Produces: `ZASIEG_ZAPYTAN_M = 1500`; `PUT /api/druzyna/start { lat, lon }` → 204 (sesja wymagana, najwyżej 5 zmian na dobę na konto, potem 429); `GET /api/klatki` → 403 `poza_okolica`, gdy któryś róg prostokąta leży dalej niż `ZASIEG_ZAPYTAN_M` od siedziby drużyny albo, bez siedziby, od jej punktu startu; 409 `brak_startu`, gdy drużyna nie ma ani siedziby, ani punktu startu. Nowe `KodBledu`: `'poza_okolica'`, `'brak_startu'`.

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('drużyna bez siedziby widzi klatki tylko wokół swojego punktu startu', ...)
  // bez PUT start → 409 brak_startu; po PUT start w Gdańsku prostokąt mapy wokół niego → 200; prostokąt 3 km dalej → 403 poza_okolica
it('drużyna z siedzibą pyta wokół siedziby, punkt startu nie jest potrzebny', ...)
it('punkt startu zmienia się najwyżej 5 razy na dobę', ...)
it('punkt startu jest tylko w pamięci serwera: po nowym stworzSerwer na tej samej bazie trzeba go podać jeszcze raz', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- serwer-okolica`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.** Punkty startu w `Map<number, { lat: number; lon: number }>` w `stworzSerwer` (nie w bazie: to w praktyce adres gracza, a siedziba i tak jest w `klatki`), zmiany liczone oknem `okno(5, DOBA, teraz)` na konto. Rogi prostokąta liczy `odlegloscM`. Popraw stare testy prostokąta w `tests/unit/serwer.test.ts` tak, żeby przed zapytaniem podawały punkt startu.
- [ ] **Krok 4: Uruchom** `npm test -- serwer`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Serwer: zajęte klatki tylko w okolicy siedziby albo punktu startu"`

### Zadanie 5: Liczniki i powroty

**Files:**
- Modify: `server/baza.ts` (migracja 3, `dolicz`, `doliczPowrot`, `liczniki`, `powroty`, `dotknijKonta` zwraca `boolean`)
- Modify: `server/app.ts` (`POST /api/zdarzenie`, `GET /api/liczniki`, powrót w `sesjaZ`, `OpcjeSerwera.tokenLicznikow`)
- Modify: `server/main.ts` (`ZM_LICZNIKI_TOKEN`), `server/README.md`
- Modify: `src/net/protokol.ts` (`ZDARZENIE_WZOR`)
- Test: `tests/unit/serwer-liczniki.test.ts`

**Interfaces:**
- Produces:
  - migracja 3: `CREATE TABLE liczniki (dzien INTEGER NOT NULL, zdarzenie TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dzien, zdarzenie)) STRICT; CREATE TABLE powroty (zalozone INTEGER NOT NULL, po_dniach INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (zalozone, po_dniach)) STRICT;`
  - `ZDARZENIE_WZOR = /^(start:(zwykly|zombie):(pl|en):(tel|komp)|cel:[A-Za-z0-9_.:-]{1,40}|dzien:(2|3|7))$/`
  - `POST /api/zdarzenie { z }` → 204, bez sesji, limit 120 na godzinę na IP, nieznane zdarzenie 400
  - `GET /api/liczniki?od=<ms>` z `Authorization: Bearer <token>` → `{ liczniki: { dzien: number; zdarzenie: string; n: number }[]; powroty: { zalozone: number; poDniach: number; n: number }[] }`; bez skonfigurowanego tokenu 404, zły token 401
  - `Baza.dotknijKonta(id, dzien): boolean` (czy zmieniło `ostatnio`)

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('zdarzenie dolicza jedynkę do pary dzień i zdarzenie, bez śladu konta i adresu', ...)
  // 3 × start:zwykly:en:tel → n = 3; w tabeli liczniki tylko kolumny dzien, zdarzenie, n
it('nieznane zdarzenie to 400, a 121. w godzinę z jednego IP to 429', ...)
it('powrót liczy się raz na dzień: konto założone w dniu D, wizyty w D, D+1 (dwa razy) i D+3 dają po_dniach 1 i 3 po jednym', ...)
it('odczyt liczników tylko z tokenem; bez tokenu w opcjach adresu nie ma', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- serwer-liczniki`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.** W `sesjaZ`, gdy `dotknijKonta` zwróci `true`, `doliczPowrot(dzien(konto.utworzone), (dzien - dzien(konto.utworzone)) / DOBA)`. Token porównuj w stałym czasie jak sekret proxy.
- [ ] **Krok 4: Uruchom** `npm test -- serwer`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Serwer: liczniki zdarzeń i powrotów bez identyfikatora gracza"`

### Zadanie 6: Wyszukiwanie adresu przez nasz serwer

**Files:**
- Create: `server/adres.ts`
- Modify: `server/app.ts` (`GET /api/adres`, `OpcjeSerwera.adres`), `server/main.ts` (`ZM_KONTAKT`), `server/README.md`
- Modify: `src/net/protokol.ts` (`WynikAdresu`)
- Test: `tests/unit/serwer-adres.test.ts`

**Interfaces:**
- Produces:
  - `WynikAdresu { lat: number; lon: number; label: string; area: string; street: string; city: string }` w `src/net/protokol.ts` (ten sam kształt co `GeocodeResult` w `src/world/osm.ts`)
  - `server/adres.ts`: `kluczZapytania(q: string, jezyk: 'pl' | 'en'): string` (SHA-256 z `q.normalize('NFC').toLocaleLowerCase('pl')`, spacje ściśnięte i obcięte, plus język); `zNominatim(j: unknown): WynikAdresu | null` (pola jak dziś w `geocode` z `src/world/osm.ts`); `zPhotona(j: unknown): WynikAdresu | null` (GeoJSON `features[0]`: `geometry.coordinates` to `[lon, lat]`, `properties.street`, `housenumber`, `city`, `district`, `locality`, `name`); `wyszukiwarka(o: OpcjeAdresu): { szukaj(q: string, jezyk: 'pl' | 'en'): Promise<WynikAdresu | null> }`
  - `OpcjeAdresu { fetch?: typeof fetch; kontakt?: string; teraz?: () => number; wpisow?: number /* 5000 */; dniPamieci?: number /* 30, brak wyniku 1 */; odstepMs?: number /* 1100 */; czekajMaxMs?: number /* 3000 */; czasMs?: number /* 6000 */ }`
  - `GET /api/adres?q=&j=pl|en` → 200 `WynikAdresu`, 404 `nie_ma`, 400 `zle_dane` (puste albo dłuższe niż 200 znaków), 503 `serwer_zajety` (Nominatim i Photon zawiodły); bez sesji, limit 30 na minutę na IP

- [ ] **Krok 1: Napisz testy, które padają** (udawany `fetch`, przykładowe odpowiedzi Nominatim jsonv2 z `addressdetails` i Photona w samym teście)

```ts
it('ten sam adres wpisany inaczej trafia w pamięć: drugi raz bez zapytania na zewnątrz', ...)
  // 'Obrońców Wybrzeża 4, Gdańsk' i '  obrońców  wybrzeża 4,  GDAŃSK ' → fetch wołany raz
it('Nominatim dostaje User-Agent z kontaktem i accept-language z języka gry', ...)
it('kolejka: dwa różne adresy naraz idą do Nominatim co najmniej 1100 ms po sobie, a gdy czekanie przekroczy 3 s, pyta Photon', ...)
it('429, błąd albo przekroczony czas Nominatim: odpowiedź z Photona', ...)
it('brak wyniku: 404 nie_ma, pamiętany przez dobę', ...)
it('dwadzieścia zapytań z jednego IP w kwadrans przechodzi, 31. w minutę to 429', ...)
it('dziennik błędów nie zawiera tekstu zapytania', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- serwer-adres`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.** Pamięć to `Map` z wymianą najstarszego wpisu przy przepełnieniu (przy trafieniu wpis przenosi się na koniec). Adresy: `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=<j>&q=`, `https://photon.komoot.io/api/?limit=1&lang=<j>&q=` (Photon zna `de`, `en`, `fr`; dla `pl` bez `lang`). User-Agent: `ZaMurem/1.0 (+https://zamurem.vercel.app; <kontakt>)`, bez części po średniku, gdy kontaktu nie ma.
- [ ] **Krok 4: Uruchom** `npm test -- serwer`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Serwer: wyszukiwanie adresu z kolejką do Nominatim, Photonem i pamięcią"`

### Zadanie 7: Klient API dla nowych tras

**Files:**
- Modify: `src/net/api.ts` (metody, `KOMUNIKATY`, `komunikatEn` dla nowych kodów)
- Test: `tests/unit/api-klient.test.ts`

**Interfaces:**
- Consumes: trasy z zadań 2, 4, 5 i 6.
- Produces (metody `utworzApi`): `druzyna(): Promise<Wynik<Ja>>`, `nowyKod(): Promise<Wynik<{ kod: string }>>`, `powrot(kod: string): Promise<Wynik<Ja>>`, `punktStartu(lat: number, lon: number): Promise<Wynik<undefined>>`, `usunDruzyne(): Promise<Wynik<undefined>>` (`DELETE /konto` z `{}`), `zdarzenie(z: string): Promise<Wynik<undefined>>` (czas 3000 ms), `adres(q: string, j: 'pl' | 'en'): Promise<Wynik<WynikAdresu>>` (czas 8000 ms).

- [ ] **Krok 1: Napisz testy, które padają** (na `serwerTestowy` z `tests/unit/serwer-pomoc.ts`)

```ts
it('drużyna, kod i powrót przez klienta: druga przeglądarka z kodem widzi ten sam znak', ...)
it('punkt startu i zapytanie o klatki: bez punktu blad brak_startu, z punktem lista', ...)
it('nowe kody błędów mają angielski komunikat', ...)
  // komunikatEn({ blad: 'zly_kod', komunikat: '…' }), 'poza_okolica', 'brak_startu' → angielskie zdania
```

- [ ] **Krok 2: Uruchom** `npm test -- api-klient`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj** metody i komunikaty.
- [ ] **Krok 4: Uruchom** `npm test -- api-klient`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Klient API: drużyna, kod powrotu, punkt startu, zdarzenia, adres"`

### Zadanie 8: Gra szuka adresu przez serwer

**Files:**
- Modify: `src/world/osm.ts` (`geocode`)
- Test: `tests/unit/geocode.test.ts`

**Interfaces:**
- Consumes: `ApiGry.adres` z zadania 7.
- Produces: `geocode(q: string, api?: Pick<ApiGry, 'adres'>): Promise<GeocodeResult>`: najpierw `api.adres(q, jezyk())` (domyślnie `utworzApi()`); wynik albo `nie_ma` kończą sprawę (przy `nie_ma` dzisiejszy błąd „Nie znalazłem takiego adresu…”); `brak_serwera`, `siec`, `czas`, `serwer_zajety` i 429 idą dzisiejszą drogą wprost do Nominatim.

- [ ] **Krok 1: Napisz testy, które padają** (udawane `api` i podmieniony `globalThis.fetch`)

```ts
it('z serwerem: wynik z /api/adres, przeglądarka nie pyta Nominatim', ...)
it('adres, którego nie ma: błąd „Nie znalazłem…” i żadnego zapytania z przeglądarki', ...)
it('bez serwera (Pages, demo): jak dziś, wprost do Nominatim', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- geocode`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.**
- [ ] **Krok 4: Uruchom** `npm test`, oczekiwane: PASS.
- [ ] **Krok 5: Commit** `git commit -m "Gra szuka adresu przez serwer, bez serwera wprost w Nominatim"`

### Zadanie 9: Gra sieciowa bez formularza

**Files:**
- Create: `src/net/flaga.ts`
- Modify: `src/main.ts` (`wlaczona` przy `new GraSieciowa`), `src/ui/zapis.ts` (osada i `startUrl` przez `siecWlaczona`)
- Modify: `src/net/gra.ts` (drużyna przy pierwszej grze, znak konta, punkt startu, blok na karcie startowej, komentarz na górze)
- Modify: `src/net/siec.ts` (`ApiSieci.punktStartu`, `startSieci` podaje punkt przed `zajete`)
- Modify: `src/ui/siec.ts` (`WidokSieci`, `htmlSieci`, komentarz na górze)
- Test: `tests/unit/siec.test.ts`, `tests/unit/druzyna-siec-en.test.ts`, `tests/unit/siec-flaga.test.ts`

**Interfaces:**
- Consumes: `ApiGry.druzyna`, `powrot`, `punktStartu`, `Ja.znak`, `Ja.anonimowe` z zadań 2 i 7.
- Produces:
  - `siecWlaczona(params: URLSearchParams, env?: Record<string, string | undefined>): boolean`: `?siec=0` wyłącza, `?siec=1` włącza, inaczej `env.VITE_SIEC === '1'`; `env` domyślnie `(import.meta as { env?: Record<string, string | undefined> }).env ?? {}`, żeby moduł działał w Node bez Vite
  - `WidokSieci.stan: 'druzyna' | 'zalogowani' | 'logowanie'`: `druzyna`: gra w sieci bez formularza (drużyna jeszcze nie założona albo anonimowa), pole kodu powrotu `#scKod` z przyciskiem `data-siec="powrot"`, odnośnik `data-siec="logowanie"` do starego logowania nickiem i odnośnik do `prywatnosc.html`; `zalogowani`: konto z nickiem jak dziś; `logowanie`: dzisiejszy formularz z przyciskiem `data-siec="wroc"`
  - `StanSieci.konto` trzyma `Ja.znak` (stare zapisy z nickiem działają bez zmian, bo znak konta z nickiem to nick)
  - `GraSieciowa.anonimowa(): boolean`

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('siecWlaczona: ?siec=1 włącza, ?siec=0 wyłącza nawet z VITE_SIEC=1, bez parametru decyduje VITE_SIEC', ...)
it('nowa gra na prawdziwym adresie bez konta zakłada drużynę raz i startuje w sieci', ...)
  // udawane api: ja() → brak_sesji; przygotuj(dane) → druzyna() wołane 1 raz, potem punktStartu przed zajete
it('druzyna() kończy się 503: gra bez sieci z jednym komunikatem, bez drugiej próby', ...)
it('demo nie zakłada drużyny', ...)
it('kod powrotu na karcie startowej loguje do drużyny i pokazuje „Kontynuuj z chmury”', ...)
it('zapis drużyny anonimowej ma konto „#<id>”; wczytany po zalogowaniu kodem tej samej drużyny gra w sieci', ...)
it('odświeżenie klatek po restarcie serwera (brak_startu) podaje punkt startu i pyta jeszcze raz, raz', ...)
it('blok na karcie startowej po angielsku: bez pól nicku i hasła, z polem kodu i odnośnikiem do prywatności', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- siec druzyna-siec-en siec-flaga`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.** Drużynę zakłada `przygotuj` przy nowej grze na prawdziwym adresie (nie przy wejściu na stronę, żeby nie robić kont dla tych, którzy tylko zajrzeli). Napisy bloku: nagłówek „Gra z sąsiadami” bez dopisku „próba”, jedno zdanie, że drużyna powstaje przy pierwszej grze i że konto nie ma e-maila ani hasła.
- [ ] **Krok 4: Uruchom** `npm test` i `npm run build`, oczekiwane: PASS, build bez błędów typów.
- [ ] **Krok 5: Zrzuty.** `npm run shots -- siec` (istniejące scenariusze sieci), obejrzyj kartę startową na komputerze i telefonie po polsku i po angielsku; dopisz scenariusz `siec-druzyna` (karta startowa z blokiem `druzyna`) w `tools/shots.ts`, jeśli żaden nie pokazuje nowego bloku.
- [ ] **Krok 6: Commit** `git commit -m "Gra sieciowa bez formularza: drużyna przy pierwszej grze, kod powrotu na karcie startowej"`

### Zadanie 10: Kod powrotu i usunięcie drużyny w grze

**Files:**
- Modify: `src/ui/okna.ts` (`menuSheet(note, siec?)`)
- Modify: `src/ui/siec.ts` (`kodSheet`, `usunSheet`)
- Modify: `src/net/gra.ts` (`kod`, `usun`, `pokazacKod`, `kodPokazany`), `src/net/siec.ts` (`StanSieci.kodPokazany?: boolean`)
- Modify: `src/main.ts` (`showMenu`, poranny raport)
- Modify: `tools/shots.ts` (scenariusz `siec-kod`)
- Test: `tests/unit/siec-kod.test.ts`

**Interfaces:**
- Consumes: `ApiGry.nowyKod`, `usunDruzyne` z zadania 7.
- Produces:
  - `menuSheet(note: string, siec?: { anonimowa: boolean }): Sheet`: z `siec` dwa przyciski: `menu-kod` („Kod powrotu drużyny” / “Team return code”) i, dla drużyny anonimowej, `menu-usun` („Usuń drużynę z serwera” / “Delete the team from the server”)
  - `kodSheet(kod: string | null, blad?: Tx | string): Sheet`: kod dużą czcionką, przycisk `data-act="kod-kopiuj"`, zdanie „Zapiszcie go. Z tym kodem wrócicie do drużyny w innej przeglądarce. Nowy kod unieważnia poprzedni.” i angielska para
  - `usunSheet(): Sheet`: potwierdzenie z przyciskami `usun-tak` i `usun-nie`
  - `GraSieciowa.kod(): Promise<string | null>`, `GraSieciowa.usun(): Promise<boolean>`, `GraSieciowa.pokazacKod(): boolean` (gra sieciowa drużyny anonimowej, kod jeszcze nie pokazany), `GraSieciowa.kodPokazany(): void`
- Zachowanie: po zatwierdzeniu pierwszego porannego raportu (`report-ok`), gdy `siec.pokazacKod()`, gra pokazuje `kodSheet` z nowym kodem raz (pole `kodPokazany` w stanie sieci trafia do zapisu). Usunięcie drużyny kończy grę sieciową: gra toczy się dalej bez sieci z komunikatem.

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('Menu gry sieciowej ma kod powrotu, a drużyna anonimowa też usunięcie; gra bez sieci nie ma żadnego', ...)
it('kodSheet po polsku i po angielsku pokazuje kod i ostrzeżenie o unieważnieniu', ...)
it('pokazacKod jest prawdą raz: po kodPokazany i po zapisie z wczytaniem już nie', ...)
it('usun: po 204 gra bez sieci, bez dalszych zapisów do chmury', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- siec-kod`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj.**
- [ ] **Krok 4: Uruchom** `npm test`, oczekiwane: PASS.
- [ ] **Krok 5: Zrzuty.** `npm run shots -- siec-kod` (Menu i okno kodu, komputer i telefon 390×844, po polsku i po angielsku), obejrzyj; okno mieści się na ekranie telefonu, a atrybucja map jest widoczna poza oknem.
- [ ] **Krok 6: Commit** `git commit -m "Kod powrotu po pierwszej nocy i w Menu, usunięcie drużyny z serwera"`

### Zadanie 11: Liczniki w grze

**Files:**
- Create: `src/net/liczniki.ts`
- Modify: `src/main.ts` (start nowej gry, `widokCelow`, zmiana dnia)
- Test: `tests/unit/liczniki.test.ts`

**Interfaces:**
- Consumes: `ApiGry.zdarzenie`, `ZDARZENIE_WZOR`, `siecWlaczona`.
- Produces:
  - `noweCele(przed: Record<string, number>, po: Record<string, number>): string[]`: klucze `StanSciezki.zrobione`, których nie było, jako `cel:<klucz>`
  - `zdarzenieStartu(tryb: 'zwykly' | 'zombie', jezyk: 'pl' | 'en', telefon: boolean): string`
  - `progiDni(dzienPrzed: number, dzienPo: number): string[]`: `dzien:2`, `dzien:3`, `dzien:7` przy przekroczeniu
  - `utworzLiczniki(api: Pick<ApiGry, 'zdarzenie'>, wlaczone: boolean): { wyslij(z: string): void }`: nic nie robi, gdy `wlaczone` jest fałszem albo zdarzenie nie pasuje do `ZDARZENIE_WZOR`; błędy sieci przemilcza
- Zachowanie: `wlaczone` to `siecWlaczona(params)` i działający serwer; start liczy się tylko w nowej grze (nie przy wczytaniu zapisu), cele tylko te zaliczone teraz (wczytany zapis z zaliczonymi celami niczego nie wysyła).

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('noweCele zwraca tylko nowe klucze', ...)
it('progiDni: z dnia 1 na 2 daje dzien:2, z 2 na 4 daje dzien:3, z 6 na 7 daje dzien:7, z 3 na 3 nic', ...)
it('wyłączone liczniki i złe nazwy zdarzeń nie wołają api', ...)
it('błąd sieci przy wysyłce nie rzuca', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- liczniki`, oczekiwane: FAIL.
- [ ] **Krok 3: Zaimplementuj** moduł i trzy zaczepy w `src/main.ts` (w `widokCelow` porównaj `sciezka.zrobione` przed i po `krokSciezki`).
- [ ] **Krok 4: Uruchom** `npm test` i `npm run bot`, oczekiwane: PASS, skrót bota bez zmian.
- [ ] **Krok 5: Commit** `git commit -m "Gra wysyła liczniki startu, celów i dni bez identyfikatora gracza"`

### Zadanie 12: Informacja o danych osobowych i regulamin

**Files:**
- Create: `public/prywatnosc.html`, `public/regulamin.html`
- Modify: `src/ui/siec.ts` (odnośniki w bloku), `src/ui/okna.ts` (odnośniki w `menuSheet` przy grze sieciowej)
- Test: `tests/unit/prywatnosc.test.ts`

**Interfaces:**
- Consumes: `KLATKI_DNI`, `KONTA_DNI` z zadania 3.
- Produces: dwie strony po polsku i po angielsku (jeden plik na stronę, dwie sekcje z kotwicami `#pl` i `#en`), w stylu karty startowej, z miejscami `[NAZWA FIRMY]`, `[ADRES]`, `[NIP]`, `[E-MAIL DO SPRAW DANYCH]`, które wypełnia Mateusz.
- Treść informacji o danych (szkic, do zatwierdzenia przez Mateusza): administrator; jakie dane trzyma serwer (numer drużyny, ciasteczko sesji, skrót kodu powrotu, nick i skrót hasła tylko dla starych kont, położenie zajętych klatek, zapis gry bez adresu); czego nie trzyma (adresów IP, e-maili, tekstu wpisanego adresu); wygaśnięcie klatek po `KLATKI_DNI` dniach i kont po `KONTA_DNI` dniach, kopie bazy 7 dni; liczniki tylko jako dzienne sumy; hosting na Vercelu (dostawca przetwarza dane połączenia, w tym adres IP, na swoich zasadach; odnośnik do jego polityki) i serwer gry na Hetznerze w UE; kafelki map pobierane wprost z OpenFreeMap; wyszukiwanie adresów przez nasz serwer, więc Nominatim i Photon nie widzą adresu IP gracza; jedyne ciasteczko to sesja, więc bez baneru zgody; prawa (dostęp, usunięcie z Menu, sprzeciw, skarga do PUODO); kontakt.
- Regulamin (szkic): gra darmowa, bez gwarancji działania, konto można usunąć w każdej chwili, zakaz psucia gry innym (masowe zakładanie drużyn, obchodzenie limitów), prawo do usunięcia drużyny łamiącej zasady, atrybucja map i źródła danych mieszkańców.

- [ ] **Krok 1: Napisz testy, które padają**

```ts
it('informacja o danych podaje te same okresy co serwer', ...)
  // plik zawiera `${KLATKI_DNI}` i `${KONTA_DNI}` w obu językach i „7”
it('obie strony mają sekcje #pl i #en i miejsca na dane firmy', ...)
it('blok sieci i Menu gry sieciowej prowadzą do prywatnosc.html', ...)
```

- [ ] **Krok 2: Uruchom** `npm test -- prywatnosc`, oczekiwane: FAIL.
- [ ] **Krok 3: Napisz strony i odnośniki.**
- [ ] **Krok 4: Uruchom** `npm test` i `npm run build`, oczekiwane: PASS, strony w `dist/`.
- [ ] **Krok 5: Zrzut** obu stron w Chromium (komputer i telefon), obejrzyj.
- [ ] **Krok 6: Commit** `git commit -m "Szkic informacji o danych osobowych i regulaminu z miejscami na dane firmy"`

### Zadanie 13: Konfiguracja wdrożenia (Vercel i drugi serwer API)

**Files:**
- Create: `vercel.json`, `deploy/pages/index.html` (strona przekierowania na nowy adres, do włączenia po starcie produkcji na Vercelu)
- Modify: `deploy/hetzner/compose.obok.yml` (usługa `api-prod`), `deploy/hetzner/README.md` (blok Caddy dla API produkcji, zmienne `.env`, Vercel), `server/README.md`
- Test: `tests/unit/vercel-json.test.ts`

**Interfaces:**
- `vercel.json` (składnia z dokumentacji Vercela: `routes`, `dest` z `${ZM_API}` i polem `env`, `transforms` typu `request.headers` z `env`; `routes` nie łączy się z `rewrites` ani `headers`):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "${ZM_API}/api/$1",
      "env": ["ZM_API"],
      "transforms": [
        { "type": "request.headers", "op": "set", "target": { "key": "x-zm-proxy" }, "args": "$ZM_PROXY_SEKRET", "env": ["ZM_PROXY_SEKRET"] }
      ]
    },
    { "src": "/assets/(.*)", "headers": { "cache-control": "public, max-age=31536000, immutable" }, "continue": true },
    { "src": "/(|index\\.html|v03/|v03/index\\.html|demo/.*)", "headers": { "cache-control": "no-cache" }, "continue": true },
    { "handle": "filesystem" }
  ]
}
```

- Zmienne Vercela (ustawia Mateusz albo ty po jego OK): Production `ZM_API=https://za-murem-api.5-75-147-27.sslip.io`, `ZM_PROXY_SEKRET=<sekret produkcji>`, bez `VITE_SIEC`; Preview `ZM_API=https://za-murem.5-75-147-27.sslip.io`, `ZM_PROXY_SEKRET=<sekret testu>`, `VITE_SIEC=1`; wersja Node w ustawieniach projektu 24.
- `compose.obok.yml`: obecna usługa `api` zostaje serwerem testowym (adres testowy jak dziś), z `ZM_ZRODLA=https://${SITE},https://zamurem-*-mateuszs-projects-73382f2a.vercel.app`, `ZM_ZAUFANE_PROXY=1`, `ZM_PROXY_SEKRET=${ZM_PROXY_SEKRET_TEST}`, `ZM_KONTAKT=${ZM_KONTAKT}`; nowa usługa `api-prod` (kontener `za-murem-api-prod`, wolumen `dane_prod`, ten sam obraz) z `ZM_ZRODLA=https://zamurem.vercel.app`, `ZM_ZAUFANE_PROXY=1`, `ZM_PROXY_SEKRET=${ZM_PROXY_SEKRET_PROD}`, `ZM_KONTAKT=${ZM_KONTAKT}`, `ZM_LICZNIKI_TOKEN=${ZM_LICZNIKI_TOKEN}`, `ZM_RESTART_H=48`, `ZM_KOPIE=/dane/kopie`.
- Blok Caddy cergo dla `za-murem-api.5-75-147-27.sslip.io`: `handle /api/*` → `reverse_proxy za-murem-api-prod:8787`, reszta 404.

- [ ] **Krok 1: Napisz test, który pada**

```ts
it('vercel.json: /api idzie pod ${ZM_API} z sekretem ze zmiennej, w pliku nie ma adresów serwerów ani sekretów', ...)
  // JSON.parse; routes[0].src === '/api/(.*)'; dest zaczyna się od '${ZM_API}'; env zawiera 'ZM_API'
  // transform ustawia 'x-zm-proxy' z args '$ZM_PROXY_SEKRET'; ostatnia trasa { handle: 'filesystem' }
  // tekst pliku nie zawiera 'sslip.io' ani 'hetzner'; brak kluczy 'rewrites' i 'headers'
```

- [ ] **Krok 2: Uruchom** `npm test -- vercel-json`, oczekiwane: FAIL.
- [ ] **Krok 3: Napisz** `vercel.json`, zmiany compose i opisy w README (`.env` na serwerze z sekretami, krok po kroku: wdrożenie `api-prod`, blok Caddy z kopią Caddyfile przed zmianą, ustawienie projektu na Vercelu).
- [ ] **Krok 4: Uruchom** `npm test -- vercel-json` i `docker compose -f deploy/hetzner/compose.obok.yml config` z przykładowym `.env` (bez demona), oczekiwane: PASS i poprawna konfiguracja.
- [ ] **Krok 5: Commit** `git commit -m "Wdrożenie: vercel.json z /api przez zmienną, drugi serwer API dla produkcji"`
- [ ] **Krok 6: Zatrzymaj się i poproś Mateusza o OK** na: założenie projektu `zamurem` w zespole „Mateusz's projects” na Vercelu z podpiętym repo `agentsmill/za-murem` (sprawdź wtedy, czy adres `zamurem.vercel.app` jest wolny; jeśli nie, zapytaj o inny i popraw `ZM_ZRODLA`), ustawienie zmiennych, wdrożenie `api-prod` i bloku Caddy na `cergo-rw-prod`. Bez OK dalsze kroki tego zadania czekają, a etap kończy się na zadaniu 14 lokalnie.
- [ ] **Krok 7 (po OK): Sprawdź podgląd gałęzi na Vercelu.** `GET <podgląd>/api/zdrowie` daje `ip: 'proxy'`; Playwright na podglądzie: karta startowa z blokiem `druzyna`, nowa gra na prawdziwym adresie startuje w sieci, kod powrotu działa w drugim kontekście przeglądarki, `/v03/` działa, w konsoli bez błędów; zrzuty obejrzane.
- [ ] **Krok 8 (po OK): Sprawdź bezpośredni adres serwera testowego bez sekretu.** Żądanie z obcym `x-real-ip` liczy się po adresie połączenia (`ip: 'xff'`), a `GET /api/liczniki` bez tokenu daje 404 albo 401.

### Zadanie 14: Bramka etapu

**Files:**
- Modify: `docs/POSTEP.md` (wpis w „Zrobione”, „Następne”), `CLAUDE.md` (sekcje „Wersje i gałęzie” i „Komendy”: Vercel, `VITE_SIEC`, nowe zmienne serwera)

- [ ] **Krok 1:** `npm test`, oczekiwane: wszystkie zielone (poza znanymi oczekiwanymi porażkami z `main`).
- [ ] **Krok 2:** `npx biome check src tests tools server index.html`: czysto.
- [ ] **Krok 3:** `npm run build`: bez błędów; w `dist/` są `prywatnosc.html`, `regulamin.html`, `v03/`.
- [ ] **Krok 4:** `npm run bot` i `npm run bot:zombie`: skróty takie jak w kroku 0 zadania 1.
- [ ] **Krok 5:** `npm run shots -- --dalej`: bez błędów strony (znany niestabilny `dotyk` powtórzyć po nazwie); obejrzane `siec-druzyna`, `siec-kod` i karta startowa na telefonie.
- [ ] **Krok 6:** Przegląd całej gałęzi przez świeżego recenzenta (tylko odczyt), poprawki z testami, które przed poprawką padały.
- [ ] **Krok 7:** Wpis w `docs/POSTEP.md` i poprawki `CLAUDE.md`; commit `"Dziennik: premiera, etap 1"`. Do Mateusza: dane firmy do informacji o danych osobowych i zatwierdzenie tekstu; dopiero potem `VITE_SIEC=1` na produkcji i przekierowanie z Pages.
