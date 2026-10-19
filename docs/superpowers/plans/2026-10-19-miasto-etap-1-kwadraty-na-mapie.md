# Miasto z kwadratów, etap 1: kwadraty na mapie — plan wykonania

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sąsiednie kwadraty 384 m z prawdziwego OSM widać na mapie obok domu, bez szwów, w grafice gry; symulacja jeszcze o nich nie wie.

**Architecture:** Kwadrat (sx, sy) to zwykły `World` o boku 384 zbudowany z geo pobranego wokół środka kwadratu, w tym samym układzie co dom (środek na adresie, obrót do ścian domu), z rastrowaniem przesuniętym o sx·384, sy·384 m. Widok trzyma sceny wielu kwadratów z kluczem kawałka zawierającym numer kwadratu, dalekie kawałki rysuje na żądanie w budżecie, a nad nieodkrytymi kwadratami rysuje mgłę. Parametr `?kwadraty=` odsłania kwadraty do zrzutów i pomiarów.

**Tech Stack:** TypeScript 7 (Node od 22.18 uruchamia `.ts` wprost), PixiJS 8 (tylko `src/render/view.ts` i `*Layer.ts`), Vitest, Playwright (`npm run shots`, `npm run perf`), Biome.

**Spec:** `docs/superpowers/specs/2026-10-19-miasto-z-kwadratow-design.md` (etap 1, sekcje „Układ i siatka kwadratów”, „Dane kwadratu”, „Świat kwadratu”, „Rysowanie wielu kwadratów”).

**Kolejność (decyzja nocnego integratora, 19.10.2026):** teraz tylko zadania 1–5 (układ, geo, rastrowanie, świat kwadratu, dema), na gałęzi od `noc-integracja` fe13220. Zadania 6–8 (rysowanie, parametr, zrzuty) dopiero na bazie, w której jest gałąź `m4-pietra`, bo zmienia te same pliki rysowania.

## Global Constraints

- Gałąź od `noc-integracja` fe13220 (to `pelna-gra` z mapą miasta i budynkami), w osobnym drzewie roboczym. Lokalne commity swobodnie; nic na GitHub ani na serwer (scala koordynator).
- Bez zmian w `src/sim`, `src/gov` i `src/ui/zapis.ts`. `npm run demos` nie zmienia istniejących plików dem (`public/demo/przymorze.json`, `lanciego.json`, `zielonki.json`, `index.json` bajt w bajt), tylko dokłada pliki sąsiadów.
- Nic nie pobiera z sieci: dane kwadratów tylko z kafelków testowych (`tests/fixtures/mvt`) i plików dem; kwadrat bez danych to „brak danych”.
- Świat domu bit w bit jak dziś: `buildWorld(geo, opts)` daje te same `terr`, `bid`, `blocked` i ten sam `worldKey`. Na szwie dom wygrywa (sekcja „Reguła: dom wygrywa na szwie” przed zadaniem 3).
- Boty bez zmian: `npm run bot` i `npm run bot:zombie` (z `--mieszkancy` i bez) dają te same skróty co `pelna-gra` w chwili odbicia gałęzi (zapisz je na starcie, krok 1 zadania 1).
- Kwadrat ma bok 384 (`SIZE`), dom to (0, 0), kwadrat (sx, sy) zajmuje globalne kafelki od sx·384 do sx·384 + 383 (tak samo y, y na południe). Globalny numer kafelka (dla etapu 2) to k·147 456 + ly·384 + lx, dom k = 0.
- Ziarno kwadratu: `hashString(seed + ':' + sx + ':' + sy)` z `src/core/rng.ts`; dom dalej `seed`. W `src/` bez `Math.random`; w nowym kodzie decyzji bez `Math.hypot`, `sin`, `cos`.
- `verbatimModuleSyntax` i `erasableSyntaxOnly`: importy z `.ts`, `import type`, bez enumów i przestrzeni nazw. PixiJS tylko w `view.ts` i warstwach `*Layer.ts`; reszta rysowania ma testy w Node.
- Komentarze po polsku, każdy plik zaczyna się nagłówkiem o kontrakcie modułu; przy zmianie zachowania popraw nagłówek.
- Atrybucja map zawsze widoczna (także przy mgle i z widocznymi kwadratami): © współtwórcy OpenStreetMap, OpenFreeMap, OpenMapTiles.
- Lint: `npx biome check src tests tools server index.html` (nie `npm run lint` w drzewie sesji).
- Po każdej zmianie wizualnej zrzut w Playwright i obejrzenie go; „gotowe” dopiero po testach, botach i zrzutach.

## Review Focus

- Kwadrat, którego dane leżą na dwóch albo czterech kafelkach z=14 (granica kafelka przechodzi przez kwadrat): budynki i drogi muszą być całe, bez dziury na granicy kafelka. Test w zadaniu 2.
- Kwadrat prawie pusty (woda, las, pola, mniej niż 4 budynki): `buildKwadrat` nie rzuca błędem (w `loadAddress` mniej niż 4 budynki to błąd, tu nie wolno). Test w zadaniu 4.
- Obrót różny od zera: trzy adresy testowe mają różne kąty, szwy muszą się zgadzać dla każdego. Test w zadaniu 4 dla wszystkich trzech.
- Duże oddalenie z dziewięcioma kwadratami na telefonie: dalekie tekstury muszą wypadać z pamięci według budżetu, a bliskie (4 MiB) nie mogą być zamawiane przy oddaleniu. Test w zadaniu 6.
- Kwadrat dodany obok już narysowanego: kawałki przy wspólnej granicy starego kwadratu muszą się przerysować z terenem sąsiada (inaczej zostaje krawężnik na szwie). Test w zadaniu 6.

---

### Task 1: Układ i przeliczenia kwadratów

**Files:**
- Create: `src/world/kwadraty.ts`
- Test: `tests/unit/kwadraty.test.ts`

**Interfaces:**
- Consumes: `Geo`, `Pt` z `src/world/geo.ts`; `World`, `SIZE`, `LOAD_RADIUS` z `src/world/world.ts`; `tilesFor` z `src/world/mvt.ts`; konwencja obrotu z `rotateGeo` w `src/world/rotate.ts`.
- Produces:
  - `interface Uklad { c: [number, number]; kat: number; bok: number }` (c to [lat, lon] adresu, jak `geo.c`; kat w radianach jak `World.angle`; bok 384)
  - `ukladDomu(geo: Geo, w: World): Uklad`
  - `kluczKwadratu(sx: number, sy: number): string` (napis `"sx,sy"`) i `zKlucza(k: string): [number, number]`
  - `srodekKwadratu(u: Uklad, sx: number, sy: number): Pt` (środek w metrach od adresu, w układzie NIEobróconym, czyli tym, w którym są współrzędne `geo`)
  - `kafelkiKwadratu(u: Uklad, sx: number, sy: number): [number, number][]` (kafelki z=14 w promieniu 720 m od środka kwadratu, czyli tak samo jak `tilesFor(lat, lon, 720)` dla domu; wtedy klucze budynków liczą się z tych samych całych budowli)
  - `sasiedzi8(sx: number, sy: number): [number, number][]` (osiem sąsiadów w stałej kolejności: N, NE, E, SE, S, SW, W, NW)

- [ ] **Step 1: Zapisz skróty botów i odcisk świata domu na starcie**

Run: `npm run bot | tail -3 && npm run bot -- --mieszkancy | tail -3 && npm run bot:zombie | tail -5 && npm run bot:zombie -- --mieszkancy | tail -5`
Expected: linijki ze skrótem stanu; wpisz je do `docs/POSTEP.md` (wpis tej gałęzi, „skróty na starcie”) i porównuj z nimi w bramce.

Utwórz `tests/unit/kwadraty-dom.test.ts` z testem „świat domu bez zmian”: dla trzech adresów `buildWorld(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS), { seed: hashString(a.label) })`, `hashString` z `terr`, `bid`, `blocked` i `worldKey`; uruchom na nietkniętym kodzie i wpisz wyniki jako stałe. Ten test musi przechodzić po każdym zadaniu.

- [ ] **Step 2: Write the failing tests**

```ts
describe('kwadraty', () => {
  it('klucz kwadratu w obie strony', () => {
    expect(kluczKwadratu(-2, 3)).toBe('-2,3');
    expect(zKlucza('-2,3')).toEqual([-2, 3]);
  });
  it('środek domu to adres', () => {
    expect(srodekKwadratu({ c: [54.4, 18.6], kat: 0.29, bok: 384 }, 0, 0)).toEqual([0, 0]);
  });
  it('środek sąsiada po obrocie układu leży 384 m na wschód', () => {
    const u = { c: [54.4, 18.6] as [number, number], kat: 0.29, bok: 384 };
    const [x, y] = srodekKwadratu(u, 1, 0);
    const r = rotateGeo({ c: u.c, b: [], r: [], a: [], w: [], poi: [{ x, y, c: 'shop' }], src: 'mvt' }, u.kat).poi[0];
    expect(r.x).toBeCloseTo(384, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });
  it('kafelki domu zawierają się w kafelkach testowych adresu', () => {
    for (const a of ADDRESSES) {
      const tiles = decodedTiles(a).map((t) => `${t.x}/${t.y}`);
      const u = { c: [a.lat, a.lon] as [number, number], kat: 0, bok: 384 };
      const dom = tilesFor(a.lat, a.lon, 720).map(([x, y]) => `${x}/${y}`).sort();
      expect(kafelkiKwadratu(u, 0, 0).map(([x, y]) => `${x}/${y}`).sort()).toEqual(dom);
      for (const [x, y] of kafelkiKwadratu(u, 0, 0)) expect(tiles).toContain(`${x}/${y}`);
    }
  });
  it('ośmiu sąsiadów w stałej kolejności', () => {
    expect(sasiedzi8(0, 0)).toEqual([[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]);
  });
});
```

(Pola `GeoPoi` i `DecodedTile` dopasuj do typów w repo; jeśli `DecodedTile` nie ma `x`, `y`, porównuj tak, jak robi to `tests/unit/fixtures.ts`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/kwadraty.test.ts`
Expected: FAIL (brak modułu `src/world/kwadraty.ts`).

- [ ] **Step 4: Implement `src/world/kwadraty.ts`**

`srodekKwadratu` to odwrotność obrotu z `rotateGeo` zastosowana do (sx·bok, sy·bok); sprawdź znak kąta na teście 3. `kafelkiKwadratu` przelicza środek na lat/lon (jak `kx`, `ky` w `toGeoT`) i woła `tilesFor(lat, lon, LOAD_RADIUS)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/kwadraty.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/world/kwadraty.ts tests/unit/kwadraty.test.ts docs/POSTEP.md
git commit -m "Miasto z kwadratów: układ i przeliczenia kwadratów"
```

### Task 2: Geo kwadratu z kafelków

**Files:**
- Modify: `src/world/mvt.ts` (`toGeoT`: filtr bliskości i promień miejsc wokół podanego punktu, budynki w całości)
- Create: `src/world/geoKwadratu.ts`
- Modify: `tests/unit/fixtures.ts` (pomocnik `geoKwadratuTestowego`)
- Test: `tests/unit/kwadraty-geo.test.ts`

**Interfaces:**
- Consumes: `Uklad`, `srodekKwadratu` (zadanie 1).
- Produces:
  - `toGeoT(tiles, lat0, lon0, R, opts?: { srodek?: Pt; caleBudynki?: boolean })` (bez `opts` dokładnie jak dziś; ze `srodek` filtr `near` i limit miejsc 720 m liczą się od `srodek`, a współrzędne dalej od (lat0, lon0) z zaokrągleniem do 0,5 m; z `caleBudynki` budynek złapany przez filtr trafia do geo ze wszystkimi kawałkami z pobranych kafelków, jak przy liczeniu kluczy)
  - `geoKwadratu(tiles: DecodedTile[], u: Uklad, sx: number, sy: number): Geo` (`toGeoT(tiles, u.c[0], u.c[1], LOAD_RADIUS, { srodek: srodekKwadratu(u, sx, sy), caleBudynki: true })`; dla (0, 0) wołający bierze zwykłe geo domu, nie tę funkcję)
  - w testach: `geoKwadratuTestowego(a: Address, sx: number, sy: number): Geo`

- [ ] **Step 1: Write the failing tests**

```ts
it('toGeoT bez opcji jak dziś', () => {
  for (const a of ADDRESSES) {
    expect(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS, {})).toEqual(toGeoT(decodedTiles(a), a.lat, a.lon, LOAD_RADIUS));
  }
});
it('budynek złapany przez filtr sąsiada jest w geo w całości', () => {
  // budynek przecięty granicą kafelka z=14 w geo kwadratu (1,0): jego pierścienie to suma wszystkich kawałków
});
it('budynek wspólny dla dwóch kwadratów ma te same współrzędne i klucz', () => {
  // dla każdego adresu: budynki z geo (0,0) i (1,0) o tym samym zm:klucz mają identyczne pierścienie
});
it('każdy budynek geo sąsiada leży w zapasie wokół jego środka', () => {
  // wszystkie budynki geoKwadratu(a, 1, 0) mają punkt albo prostokąt w ±(LOAD_RADIUS + 30) od srodekKwadratu(u, 1, 0)
});
it('kwadrat na granicy kafelków z=14 ma budynki z obu kafelków', () => {
  // wybierz (sx, sy), dla którego kafelkiKwadratu zwraca co najmniej 2 kafelki; budynki z geo pochodzą z każdego z nich
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/kwadraty-geo.test.ts`
Expected: FAIL (brak `geoKwadratu`).

- [ ] **Step 3: Implement**

`toGeoT` dostaje opcjonalne `opts`: `srodek` przesuwa środek filtra `near` (`M = R + 30`) i warunek miejsc (`hypot ≤ 720` przez `Math.sqrt`), `caleBudynki` składa budynek ze wszystkich kawałków (jak `calosc` przy kluczach). Bez opcji kod daje bajt w bajt to samo (test 1).

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/kwadraty-geo.test.ts tests/unit/klucze.test.ts`
Expected: PASS (klucze bez zmian).

- [ ] **Step 5: Commit**

```bash
git add src/world/mvt.ts src/world/geoKwadratu.ts tests/unit/fixtures.ts tests/unit/kwadraty-geo.test.ts
git commit -m "Miasto z kwadratów: geo kwadratu z kafelków"
```

### Reguła: dom wygrywa na szwie

Świat domu się nie zmienia, więc na granicy z domem dopasowuje się sąsiad (decyzja nocnego integratora). Geo domu ma tylko bliskie kawałki budynków, więc długi blok przy brzegu domu bywa u niego wyprostowany (`straighten`) inaczej niż z całej budowli. Dlatego:

- budynek, który jest w świecie domu (ten sam `zm:klucz`), kwadrat sąsiedni rastruje z pierścieniami z geo domu po obrocie i prostowaniu (`przygotujGeo` z zadania 4), a nie ze swoimi;
- pozostałe budynki prostuje z całej budowli (z `caleBudynki`), więc dwa kwadraty bez domu dają ten sam wynik;
- testy szwu (zadania 3 i 4) porównują kafelki przy granicy z domem i wypisują wyjątki, czyli budynki, w których dom ma niepełny obrys, z kluczem i powodem; wyjątek bez powodu to błąd.

### Task 3: Rastrowanie z przesunięciem i wspólny rdzeń terenu

**Files:**
- Modify: `src/world/raster.ts`
- Modify: `src/world/world.ts` (kroki 1–5a wydzielone do `rastrujTeren`)
- Test: `tests/unit/kwadraty-raster.test.ts`

**Interfaces:**
- Produces:
  - `fillRing(ring, size, cb, ox = 0, oy = 0)`, `stampSegment(a, b, width, size, cb, ox = 0, oy = 0)`, `stampLine(line, width, size, cb, ox = 0, oy = 0)`: kafelek (i, j) ma środek w metrach (i − size/2 + ½ + ox, j − size/2 + ½ + oy)
  - `rastrujTeren(geo: Geo /* już obrócone i wyprostowane */, size: number, ox: number, oy: number): { terr: Uint8Array; bid: Int32Array; blocked: Uint8Array; kept: ... }` — dokładnie kroki 1–5a z `buildWorld` (obszary, cieki, ścieżki, chodniki, jezdnie, budynki, przejścia przez budynki, woda blokuje); `buildWorld` woła ją z `ox = oy = 0`

- [ ] **Step 1: Sprawdź odcisk świata domu**

Run: `npm test -- tests/unit/kwadraty-dom.test.ts`
Expected: PASS (stałe z zadania 1).

- [ ] **Step 2: Write the failing test of seams**

```ts
it('teren kwadratów (0,0) i (1,0) schodzi się z terenem kwadratu przesuniętego o pół boku', () => {
  for (const a of ADDRESSES) {
    // geo obrócone kątem domu i wyprostowane, raz dla całego testu (zawiera dane obu kwadratów)
    const A = rastrujTeren(g, 384, 0, 0);
    const B = rastrujTeren(g, 384, 384, 0);
    const S = rastrujTeren(g, 384, 192, 0);
    for (let y = 0; y < 384; y++)
      for (let x = 0; x < 192; x++) {
        expect(S.terr[y * 384 + x]).toBe(A.terr[y * 384 + x + 192]);
        expect(S.terr[y * 384 + x + 192]).toBe(B.terr[y * 384 + x]);
        expect(S.blocked[y * 384 + x]).toBe(A.blocked[y * 384 + x + 192]);
      }
  }
});
```

Geo do tego testu musi mieć dane z zapasem dla obu kwadratów: zbuduj je z `toGeoT(tiles, lat, lon, LOAD_RADIUS + 384)` dla testu albo połącz geo (0,0) i (1,0) po kluczach budynków.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/kwadraty-raster.test.ts`
Expected: FAIL (brak `rastrujTeren`).

- [ ] **Step 4: Implement**

Przesunięcia w `raster.ts` jako parametry domyślne. Wydziel kroki 1–5a z `buildWorld` do `rastrujTeren` bez zmiany kolejności i reguł; `buildWorld` woła ją z zerowym przesunięciem.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/kwadraty-raster.test.ts tests/unit/kwadraty-dom.test.ts && npm test -- world`
Expected: PASS, w tym „świat domu bez zmian” ze stałymi z zadania 1.

- [ ] **Step 6: Commit**

```bash
git add src/world/raster.ts src/world/world.ts tests/unit/kwadraty-raster.test.ts
git commit -m "Miasto z kwadratów: rastrowanie z przesunięciem, wspólny rdzeń terenu"
```

### Task 4: Świat kwadratu

**Files:**
- Modify: `src/world/world.ts` (`buildKwadrat`, puste pola siedziby w typie `World`)
- Test: `tests/unit/kwadraty-swiat.test.ts`

**Interfaces:**
- Consumes: `rastrujTeren` (zadanie 3), `Uklad`, `seedKwadratu`.
- Produces:
  - `seedKwadratu(seed: number, sx: number, sy: number): number` (w `src/world/kwadraty.ts`)
  - `przygotujGeo(geo: Geo, kat: number): Geo` (w `src/world/world.ts`: `straighten(rotateGeo(geo, kat))`, ta sama, której używa `buildWorld`)
  - `buildKwadrat(geo: Geo, opts: { seed: number; uklad: Uklad; sx: number; sy: number; dom?: Geo }): World` — `dom` to geo domu po `przygotujGeo` (reguła „dom wygrywa na szwie”); obrót `uklad.kat` (nie `dominantAngle`), `straighten` (budynki z kluczem obecnym w `dom` biorą jego pierścienie), `rastrujTeren(..., sx·384, sy·384)`, opis budynków, drzewa, wejścia, wraki przy ulicach z ziarna kwadratu; `hq = -1`, `dryTree = -1`, `props = []`, `apts = []`, `damage = []`, `fence` i `interior` puste (bez kafelków; typ `World` dopuszcza takie wartości, `buildWorld` domu bez zmian)
  - Reguły szwu: budynek z kafelkami w kwadracie zostaje, jeśli ma tu co najmniej 3 kafelki albo jego cały obrys z geo ma co najmniej 3 m² i przecina granicę kwadratu; drzwi (`findEntrances`) nie stają na ścianie leżącej na granicy kwadratu, za którą budynek ciągnie się dalej; krok 9a (łączenie odciętych obszarów bramą) traktuje obszar dotykający granicy kwadratu jako połączony

- [ ] **Step 1: Write the failing tests**

```ts
it('kwadrat jest deterministyczny i bez siedziby', () => {
  const g = geoKwadratuTestowego(PRZYMORZE, 1, 0);
  const a = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0 });
  const b = buildKwadrat(g, { seed: 7, uklad, sx: 1, sy: 0 });
  expect(a.hq).toBe(-1);
  expect(a.fence.tiles.length).toBe(0);
  expect(hashString(String(a.terr))).toBe(hashString(String(b.terr)));
});
it('budynek przecięty granicą nie ma dziury na szwie', () => {
  // dla każdego adresu i kwadratu (1,0): kafelki BUILDING w kolumnie 0 kwadratu (1,0) i kolumnie 383 domu
  // są tam, gdzie rastrujTeren kwadratu przesuniętego o pół boku ma BUILDING (jak w teście z zadania 3)
});
it('drzwi nie stoją na linii cięcia', () => {
  // dla budynków kwadratu (1,0) i (0,1) dotykających granicy: żadne wejście nie ma tile w kolumnie 0 albo wierszu 0,
  // jeśli out wypadałby poza kwadrat
});
it('prawie pusty kwadrat się buduje', () => {
  const pusty = { ...geoKwadratuTestowego(ZIELONKI, -1, 1), b: [] };
  expect(() => buildKwadrat(pusty, { seed: 1, uklad, sx: -1, sy: 1 })).not.toThrow();
});
it('szwy dla wszystkich trzech adresów (różne kąty)', () => {
  // dla każdego adresu: buildKwadrat (0,1) i (1,0) z ukladDomu; teren przy granicy z domem zgodny jak w zadaniu 3
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/kwadraty-swiat.test.ts`
Expected: FAIL (brak `buildKwadrat`).

- [ ] **Step 3: Implement `buildKwadrat`**

Kroki 1–7 przez `rastrujTeren` i istniejący opis budynków, 9 i 9a, 10 z regułą drzwi, 15 (wraki) z ziarnem kwadratu bez wykluczeń siatki. Kroki 8 i 11–14, 16 (siedziba, wnętrze, suche drzewo, siatka, sterty, mieszkania) pominięte.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/kwadraty-swiat.test.ts tests/unit/kwadraty-raster.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/world/world.ts src/world/kwadraty.ts tests/unit/kwadraty-swiat.test.ts
git commit -m "Miasto z kwadratów: świat kwadratu bez szwów"
```

### Task 5: Dane sąsiadów w demach

**Files:**
- Modify: `tools/make-demos.ts`
- Modify: `src/world/load.ts` (`loadDemoKwadraty`)
- Create: `public/demo/<klucz>-kwadraty.json` (wynik `npm run demos`, zatwierdzony)
- Test: `tests/unit/kwadraty-dema.test.ts`

**Interfaces:**
- Produces: `loadDemoKwadraty(key: string): Promise<Record<string, Geo>>` (klucz kwadratu → geo; plik pobierany tylko przy `?kwadraty=`)

- [ ] **Step 1: Write the failing test**

```ts
it('plik sąsiadów dema ma osiem kwadratów zgodnych z geoKwadratu', () => {
  for (const a of ADDRESSES) {
    const plik = JSON.parse(fs.readFileSync(`public/demo/${a.key}-kwadraty.json`, 'utf8'));
    expect(Object.keys(plik).sort()).toEqual(sasiedzi8(0, 0).map(([x, y]) => kluczKwadratu(x, y)).sort());
    expect(plik['1,0']).toEqual(geoKwadratuTestowego(a, 1, 0));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/kwadraty-dema.test.ts`
Expected: FAIL (brak plików).

- [ ] **Step 3: Implement and generate**

`make-demos.ts` zapisuje dla każdego adresu osiem sąsiadów z kafelków testowych i wypisuje rozmiar pliku. Jeśli plik dema przekracza 1,5 MB, zostaw cztery boczne kwadraty (N, E, S, W) i zmień test na nie; zapisz rozmiary w dzienniku.

Run: `npm run demos`
Expected: trzy pliki `*-kwadraty.json`, rozmiary w wyjściu.

- [ ] **Step 4: Run test**

Run: `npm test -- tests/unit/kwadraty-dema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

Run: `git diff --exit-code public/demo/przymorze.json public/demo/lanciego.json public/demo/zielonki.json public/demo/index.json`
Expected: brak różnic (istniejące dema bez zmian).

```bash
git add tools/make-demos.ts src/world/load.ts public/demo tests/unit/kwadraty-dema.test.ts
git commit -m "Miasto z kwadratów: dane ośmiu sąsiadów w demach"
```

### Task 6: Widok z wieloma kwadratami

**Files:**
- Modify: `src/render/chunks.ts` (zamówienia z numerem kwadratu, budżet dalekich, poziom „bardzo daleko”)
- Modify: `src/render/art/scene.ts` (`ChunkScene.brzeg`), `src/render/art/chunkArt.ts` (sąsiad przy brzegu z `brzeg`)
- Modify: `src/render/chunkWorker.ts` (kilka scen, ostatnie cztery i dom)
- Modify: `src/render/view.ts` (`dodajKwadrat`, kamera, pozycje sprite'ów)
- Create: `src/render/mglaLayer.ts`
- Test: `tests/unit/kwadraty-render.test.ts`

**Interfaces:**
- Produces:
  - `Order.q?: number` (numer kwadratu w widoku; brak = 0, dom) i klucz zamówienia z `q`
  - `export const LOD_VERY_FAR = 2` (piksele na metr przy zoomie poniżej 0,125)
  - `ChunkScene.brzeg?: { n?: Uint8Array; e?: Uint8Array; s?: Uint8Array; w?: Uint8Array }` (pas 384 kodów terenu sąsiada za każdą krawędzią)
  - `planOrders(...)` z listą kwadratów i budżetem dalekich tekstur: `MAX_FAR = PHONE ? 144 : 432` (1 i 3 kwadraty po 144; decyzja integratora)
  - `GameView.dodajKwadrat(sx: number, sy: number, scene: Scene): number` (zwraca `q`) i `GameView.kwadratyWidoczne(): number[]`
  - `class MglaLayer` (PixiJS): ciemne prostokąty nad nieodkrytymi kwadratami sąsiadującymi z odkrytymi i znak zapytania w środku każdego

- [ ] **Step 1: Write the failing tests (Node, bez PixiJS)**

```ts
it('zamówienia dalekich kawałków najpierw dla widocznych kwadratów i w budżecie', () => {
  // dziewięć kwadratów, kamera nad domem przy zoomie 0,3: zamówienia mają q domu na początku,
  // liczba dalekich tekstur w pamięci nie przekracza MAX_FAR
});
it('przy zoomie poniżej 0,125 nie ma zamówień bliskich ani dalekich, tylko bardzo dalekie', () => {});
it('klucze zamówień różnych kwadratów są różne', () => {});
it('dodanie sąsiada przerysowuje tylko kawałki przy wspólnej krawędzi', () => {
  // ScenePatch z brzeg dla kwadratu (0,0) po dodaniu (1,0) dotyka kawałków cx = 11 (12 kawałków)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/kwadraty-render.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement chunks, scene and worker**

Dom to `q = 0` i dalej `setScene` jak dziś (dokładnie te same zamówienia bez innych kwadratów). Workery trzymają mapę `q → scena`: co najmniej 9 scen (dom i ośmiu sąsiadów), dalsze wypadają od najdawniej użytej.

- [ ] **Step 4: Implement view and fog**

Sprite kawałka stoi na ((sx·384 + cx·32)·TILE, (sy·384 + cy·32)·TILE); kamera ogranicza się do prostokąta wszystkich kwadratów; `MglaLayer` nad mapą, pod interfejsem.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/kwadraty-render.test.ts && npm test -- render chunks`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/render tests/unit/kwadraty-render.test.ts
git commit -m "Miasto z kwadratów: widok z wieloma kwadratami i mgłą"
```

### Task 7: Parametr `?kwadraty=` w grze

**Files:**
- Modify: `src/main.ts`
- Test: `tests/unit/kwadraty-parametr.test.ts`

**Interfaces:**
- Produces:
  - `czytajKwadraty(param: string | null): [number, number][]` (w `src/world/kwadraty.ts`): `"3x3"` → osiem sąsiadów, `"1,0;0,-1"` → lista par, puste albo błędne → `[]`; bez (0, 0) i bez powtórzeń
  - `window.zm.kwadraty`: lista `{ klucz, msSwiat, msScena }` dla dodanych kwadratów

- [ ] **Step 1: Write the failing test**

```ts
it('czytajKwadraty', () => {
  expect(czytajKwadraty('3x3')).toEqual(sasiedzi8(0, 0));
  expect(czytajKwadraty('1,0;0,-1;1,0;0,0')).toEqual([[1, 0], [0, -1]]);
  expect(czytajKwadraty('x')).toEqual([]);
  expect(czytajKwadraty(null)).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/kwadraty-parametr.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Po zbudowaniu domu jak dziś: dla dema `loadDemoKwadraty`; dla prawdziwego adresu nic się nie pobiera, kwadraty pokazują „brak danych” (mgła z napisem). Dla każdego kwadratu z danymi `buildKwadrat` (z `dom: przygotujGeo(geo domu, world.angle)`), `buildScene`, `view.dodajKwadrat`. Symulacja dostaje tylko dom, więc kliknięcie i polecenie poza domem gra ignoruje; `cam=all` obejmuje wszystkie kwadraty.

- [ ] **Step 4: Run test and the game**

Run: `npm test -- tests/unit/kwadraty-parametr.test.ts` → PASS; potem `npm run shots -- kwadraty` (zadanie 8).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/world/kwadraty.ts tests/unit/kwadraty-parametr.test.ts
git commit -m "Miasto z kwadratów: parametr ?kwadraty= do zrzutów i pomiarów"
```

### Task 8: Zrzuty, pomiary i bramka

**Files:**
- Modify: `tools/shots.ts`, `tools/perf.ts`
- Modify: `docs/POSTEP.md`, nagłówki zmienionych modułów, `CLAUDE.md` (parametr `kwadraty` na liście parametrów adresu)

- [ ] **Step 1: Scenariusze zrzutów**

Dodaj do listy w `tools/shots.ts`: `kwadraty-3x3-<demo>` (`demo=<demo>&kwadraty=3x3&cam=all&speed=0`) dla trzech dem; `kwadraty-szew-<demo>` (kamera na granicy domu i kwadratu (1,0) przy zoomie 1, np. `cam=384,192,1`); `kwadraty-telefon` (390×844); `kwadraty-noc` (`godzina=22`). Uruchom też z `--kod`.

Run: `npm run shots -- kwadraty && npm run shots -- kwadraty --kod`
Expected: zrzuty bez błędów strony; obejrzyj każdy: brak kresek, krawężników i uciętych budynków na szwach, mgła wokół, atrybucja widoczna.

- [ ] **Step 2: Pomiary**

`tools/perf.ts` dostaje `--kwadraty=3x3` i `--kwadraty=5x5`; dla 5×5 brakujące kwadraty (poza danymi testowymi) powielają geo najbliższego sąsiada z przesunięciem, tylko w narzędziu pomiaru, z komentarzem o tym.

Run: `npm run perf -- --kwadraty=3x3`, `npm run perf -- --kwadraty=5x5`, oba także z `--zoom=0.3` i `--zoom=0.1`, na laptopie i z telefonem (CPU 4×, jak w istniejących pomiarach)
Expected: zapisz kl/s, p95 i najgorszą klatkę oraz czas budowy świata i sceny kwadratu (`window.zm.kwadraty`) w dzienniku; przy jednym kwadracie bez pogorszenia wobec `pelna-gra`.

- [ ] **Step 3: Pełna bramka**

Run: `npm test && npx biome check src tests tools server index.html && npm run build && npm run bot | tail -3 && npm run bot:zombie | tail -5 && npm run shots -- --dalej`
Expected: wszystko zielone, skróty botów jak w zadaniu 1, pełne zrzuty bez błędów.

- [ ] **Step 4: Dziennik i commit**

Wpis w `docs/POSTEP.md` (co zrobione, liczby, zrzuty obejrzane, rozmiary plików dem, decyzje własne do przejrzenia), parametr `kwadraty` w `CLAUDE.md`.

```bash
git add tools/shots.ts tools/perf.ts docs/POSTEP.md CLAUDE.md src
git commit -m "Miasto z kwadratów etap 1: zrzuty, pomiary i bramka"
```
