# Krok 5 (mieszkancy -> gra): mapa miejsc wpiecia

Read-only exploration of /Users/mpawelczuk/Post-pixel (git show / diff / grep only; nothing checked out or modified).
Language: prose in English, identifiers and quotes in Polish as in the code.

## 0. READ FIRST: pelna-gra moved while I was reading

- At the start of the exploration `pelna-gra` = 59519d4 ("Scalenie mieszkancow z adresu do 7e45ef4 w pelna-gra"), same as `origin/pelna-gra`.
- At 02:50:07 (local, 18.10.2026) another session merged `druzyna` into it: local `pelna-gra` = **14326cd** "Merge branch 'druzyna' into pelna-gra" (parents 59519d4 and 8ad481b = druzyna tip). `origin/pelna-gra` is still 59519d4. Stable at 02:56.
- Consequences:
  * `git diff pelna-gra...druzyna` is now EMPTY (druzyna is an ancestor). The druzyna feature is the diff `59519d4..14326cd` (17 files, +2839/-16), or `285be2e..8ad481b` on the druzyna side. Section B uses that.
  * All line numbers below for "pelna-gra" are on **14326cd** (tip incl. druzyna), unless marked "(59519d4)". Files untouched by druzyna (world/*, mieszkancy/*, sim/mieszkania.ts, sim/house.ts, ui/zapis.ts, ui/okna.ts, ui/mieszkania.ts, load.ts, osm.ts, mvt.ts, tests/unit/mieszkancy-*) have identical line numbers on both. Changed by druzyna: sim.ts (+27), snapshot.ts (+3), people.ts (+3), karta.ts, main.ts (+22), index.html (+3), new content/druzyna.ts, content/historia.ts, ui/druzyna.ts, ui/druzyna.css, tests, tools/shots.ts.
  * To stay stable, quote SHAs, not branch names: `git show 14326cd:src/sim/sim.ts`.
- Other refs: `druzyna` = 8ad481b, `mp-serwer` = 1c0302a (merge-base with pelna-gra 261714c, i.e. it forked BEFORE swiat-id-budynkow and mieszkancy landed).
- Note for zsh: `git show $P:path` breaks (":p" modifier); use `${P}:path` or literal SHA.

---------------------------------------------------------------------------------------------------

## A. pelna-gra (14326cd)

### A1. createSim, people, residents, randomness (src/sim/sim.ts)

Signature and options (sim.ts:629-643, 712):
```ts
export interface SimOpts {
  core?: number;                       // 630 board size, default 4
  team?: readonly OsobaDruzyny[];      // 636 (druzyna) own team, length replaces core
  residents?: number;                  // 638 HQ residents; default 3-8 by flats connected to the yard
  crowd?: number;                      // 640 perf crowd, game: 0
  mode?: GameMode;                     // 642
}
export function createSim(w: World, seed: number, opts: SimOpts = {}): SimState   // 712, SYNCHRONOUS, no async/tables
```
- Randomness: `rng: { s: seed | 0 }` (717), `const rnd = rngOf(st.rng)` (750). mulberry32 in src/core/rng.ts (`rngOf`, `nextRandom`, `pick`, `ri`, `hashString` = FNV-1a 8 hex). The same `st.rng` is used later by addResidents (1018), addCore (1123), gov events (`gov/wydarzenia.ts:162` calls `makePerson(rngOf(st.rng), ...)`). The mieszkancy generator has its OWN seeding (`losDla(...kluczy)` in src/mieszkancy/los.ts: `mulberry(parseInt(hashString(klucze.join('\u0001')),16))`), independent of the sim seed; per-building seeds come from `Budynek.klucz`.
- Seed in the game: main.ts:223 `seed = saved?.seed ?? (Number(params.get('seed')) || Number.parseInt(hashString(data.addr), 16) || 2051)`; the same `seed` goes to `buildWorld` (225) and `createSim` (237).

Board (zarzad), sim.ts:812-829, then override 830-841:
```ts
const team = druzynaDoGry(opts.team);                         // 744
const core = team ? team.length : (opts.core ?? 4);           // 745
// 812-829
const need = ['cieplo','bud','med','uprawa'] as const;
for (let k = 0; k < core; k++) {
  const d = need[k % need.length];
  const profs = PROFS.filter((p) => (p[2][d]||0) >= 1 && (p[2][d]||0) <= 3);
  const p = makePerson(rnd, new Set(st.people.map((q) => q.first)), () => st.nextId++, { prof: pick(profs, rnd), home: w.hq });
  st.people.push(p);
  let at = spawnNear(w, door, k, rnd);  if (k < spots.length) at = spots[k];   // rng draw kept so state does not depend on interior
  const pawn = newPawn(st, w, 'core', st.people.length - 1, at, door, k);       // Pawn.person = index in st.people
  pawn.needs = startNeeds(); pawn.weapon = kit.core[k] ?? null; st.pawns.push(pawn);
}
team?.forEach((o,k) => { if (bledyOsoby(o).length) {console.warn(...); return;} Object.assign(st.people[k], osobaDoGry(o)); });  // 831-841
```
- Beds of HQ flat get owners: `beds[k].owner = pawn.id` for k-th pawn (842-848, in `inHomeApt`), so board <-> flat link is only "the board lives in `house.home` flat", no per-person flat.

HQ residents (anonymous pawns!), sim.ts:849-853, 1012-1077:
```ts
if (house) {
  const apts = residentApts(st, w, house);                       // 947: flats != house.home, reachable from the yard (fence/gate closed), lives()
  st.cap = Math.min(8, 3 * apts.length);
  addResidents(st, w, opts.residents ?? (apts.length ? Math.min(8, Math.max(3, 2*apts.length + 1)) : 0));
}
export function addResidents(st, w, n, arrive = false): number   // 1012
```
- `addResidents` (1012): returns 0 when `!apts.length && !arrive` (1017); picks flat `apts[idx % apts.length]` (1039) (or `aptFor` for admitted people, 1090); `newPawn(st, w, 'resident', -1, start, start, 4 + Math.floor(rnd()*12))` (1052); `p.apt = apt` (1053); needs 70/60/70/100/60 (1054); bed owner assigned from furniture of that flat (1076). Admitted newcomers: `applyGov` -> `addResidents(st, w, fx.residents, true)` (sim/gov.ts:247), `removeResidents` pops last ones (1098).
- **Residents have NO Person.** `Pawn.person = -1`, no name. `Pawn.apt` = flat number (Room.apt) in HQ interior (sim.ts:351 `apt: number; // mieszkaniec: numer jego mieszkania w siedzibie (-1: inni)`). They are NOT clickable: `view.pick` only returns `kind === 'core'` (render/view.ts:951-967) and main.ts:953/1433 select core only; `snapshot().people` is built from core pawns only (snapshot.ts:234); `snapshot().residents` is just a count (331).
- Existing fallbacks for nameless residents: death entry `name = who?.name ?? (szabrownik ? 'Szabrownik' : 'Mieszkaniec')` (sim.ts:4327-4329; `Dead.id` '' for non-core, `Dead` = 483-491); combat `p.person >= 0 ? st.people[p.person] : undefined` (4215, 4327); burn dialog owner name `sim.st.people[owner.person]?.name ?? null` (main.ts:1046). So giving residents a `person` index would light these up for free. But code assuming `people[pawn.person]` for core only: sim/gov.ts:87,121; sim.ts:1141, 5153; main.ts:973-976 (filtered by core). `st.people` is not iterated as "the board" anywhere I found except `.map(q=>q.first)` for name uniqueness (817) and druzyna override by index `st.people[k]` k<team.length (840), i.e. board persons must stay first in `st.people`.
- Klatki: HQ interior has rooms of `kind:'klatka'` with `Room.apt = -1` (world/interior.ts:91-99); flat->klatka link is not stored, only derivable: `roomLinks(h, size)` in sim/house.ts:89 (pairs of rooms joined by doors) as createSim does for `stairs` (sim.ts:786-790). HQ interior is GROUND FLOOR ONLY ("parter", interior.ts:1), flats compact-numbered in room order by `compact()` (interior.ts:982-1002), so number of HQ flats = what the template fits at ground level, unrelated to `Budynek.mieszkania`.

Person (src/content/people.ts:12-29):
```ts
export interface Person { id: string /*"s<nextId>"*/; first: string; name: string; f: boolean; prof: string;
  skills: Partial<Record<Dom, number>>; age: number; traits: string[]; home: number /*building id, w.hq*/;
  assign: Assign | null; sick: boolean; dead: boolean; gone: boolean;
  story?: string; }            // 26-28, added by druzyna
```
`makePerson(rnd, used, nextId, opts?: {f?, prof?: Prof, home?})` at people.ts:41. Generator `Osoba` has no traits/skills/prof strings: would need `fachOsoby(o).umiejetnosci` + `nazwaFachu(id, plec)` for prof/skills, age from rocznik, traits drawn separately (generator gives none). Age convention: fachy.ts:14-15 says game age = `w.rok - rocznik` (2051 - rocznik), while tools/mieszkancy.ts:10,101 uses `rok - 1 - rocznik`. Pick one.

SimPerson (src/sim/snapshot.ts:38-76): `pawn, id(s1..), name, first, f, age, prof, skills, traits, story?(52), needs, moods, job, doing, asleep, inside, tile, carry, away, post, weapon, ammo, bite, maimed`. Built for core pawns only (snapshot.ts:234-273; `...(who.story ? { story: who.story } : {})` at 249).

Save/migration: `SimState.v = 3`, `Sim` constructor calls `migrate(st, w)` (sim.ts:1336; restores `apts`, `damage`, `builds`); zapis.ts `Save {v:1, data: Loaded (incl. geo), seed, sim, gov, screen, cam?, world?: worldKey}`; `worldKey` counts only size/hq/#buildings/#trees/dryTree/#fence tiles/#rooms/#furniture (zapis.ts:31-49), NOT apts/damage, so changing flat states via the generator will NOT invalidate old saves by itself.

### A2. src/world/apts.ts

Types (apts.ts):
```ts
export type AptWhy = 'wyjazd'|'wymarcie'|'splądrowanie'|'zalanie'|'pozar';          // 16
export interface AptState { bid: number; apt: number; state: 'zarzad'|'mieszkancy'|'puste'; why?: AptWhy; year?: number }  // 18-26
export type DamageKind = 'okno'|'drzwi'|'rura'|'podloga'|'piec';  export interface Damage {kind, tile, bid, apt}        // 28-36
export interface Smieci {kind:'smieci', x, y, w:1, h:1, n}                                                              // 39
export type AptWorld = Pick<World,'size'|'seed'|'blocked'|'buildings'|'hq'|'interior'|'fence'>;                       // 49
export interface Apts { apts: AptState[]; furniture: Furniture[]; trash: Smieci[]; damage: Damage[] }                  // 51
export function settleApts(w: AptWorld, given?: readonly AptState[]): Apts                                              // 87
export function applyApts(w: Pick<World,'apts'|'damage'|'props'|'interior'>, r: Apts): void                            // 219
```
- Scope: ONLY the HQ (`bid = w.hq`, line 89); `given` is filtered with `g.bid === bid` (109). `apt` = `Room.apt` of the HQ interior (compact ids 0..n-1, n = max apt + 1, line 90). Flats exist only for the HQ; other buildings have no interior/flats ("inne budynki dostaną wnętrze, kiedy spółdzielnia je zajmie", world.ts:374-375).
- State semantics: `gone = g ? g.state === 'puste' : empty.has(a)` (117) -> any given flat not 'puste' becomes `{state:'mieszkancy'}` (118-121); 'puste' flat takes `why`/`year` from given, else drawn from the flat's own seed (122-131, RECIPES years: wyjazd 2029-2038, wymarcie 2035-2050, splądrowanie 2036-2051, zalanie 2034-2051, pozar 2033-2051); then content of empty flats (broken furniture, trash piles, damage) is derived from `why` (154-212).
- **Board flat rule**: `others` excludes `it.home` (99) and `if (a === it.home) { apts.push({ bid, apt: a, state: 'zarzad' }); continue; }` (112-115): whatever `given` says for the flat with the koza, it stays 'zarzad'. Header comment lines 1-9.
- Default (no `given`): random half empty; among flats reachable from the yard "zawsze są mieszkańcy" and with >=2 such flats one is left empty (95-106). **With `given` there is no such guarantee**: if the generator marks all yard-reachable flats 'puste', `residentApts` is empty and `addResidents` returns 0 (sim.ts:1017), `st.cap = 0`.
- `reachable(w)` (apts.ts:228) mirrors sim's `residentApts`.
- `applyApts` (219-224) is idempotent/re-callable ("Można wołać ponownie, np. ze stanami od generatora mieszkańców"): replaces `w.apts`, `w.damage`, `w.interior.furniture`, and the `smieci` entries of `w.props`. `settleApts` strips `broken` from the base furniture first (91), so a second call is clean (tests/unit/apts.test.ts:208-237; interior.test.ts:161).
- buildWorld use: `BuildOpts.apts?: readonly AptState[]` (world.ts:157-158); last step 16: `applyApts(world, settleApts(world, opts.apts))` (world.ts:462). CHICKEN-AND-EGG: apt numbers exist only after `buildInterior` (inside buildWorld), so `opts.apts` can only be used if numbering is known in advance; practical path = `buildWorld(geo, {seed, street})` then compute AptState[] from `world.interior` + generator result, then `applyApts(world, settleApts(world, states))` again (cheap, deterministic). `World.apts`/`damage` fields: world.ts:111/113 (sim reads them via `aptsFrom(w, house)`/`damageFrom` in `createSim`, sim.ts 763-764).
- Sim-side game state: `AptGame {apt, state, why?, year?, ours, searched[]}` (sim/mieszkania.ts:11-22), `st.apts` (sim.ts:593). Empty flats come from generator `puste` count and dziennik `Wpis{typ:'opuszczone', rok, kto: gospodarstwoId, z: lastPersonId}` (czas-stan.ts:255-266); `WynikBudynku.puste` is only a number (typy.ts:72), there is no ready `why`.

### A3. WorldBuilding vs Geo buildings (src/world/world.ts)

```ts
export interface WorldBuilding {            // 37-58
  id: number; cls: BuildingClass; levels: number; name: string; area: number; tiles: number;
  x0:number; y0:number; x1:number; y1:number; cats: string[]; entrances: Entrance[];
  tags: Record<string,string>;
  osmId?: string;      // 55  = tags.id ("w123"/"r45"); Overpass always; tiles only for non-glued building or address on the building
  startDate?: string;  // 57  = tags.start_date raw ("1975","1970s","~1965"); ONLY Overpass
}
export interface Entrance { tile: number; out: number; dir: Dir }   // 29-35
```
- Created at world.ts:279-314 (`kept.map((o, id) => ({... tags: o.b.t, ...(o.b.t.id ? { osmId: o.b.t.id } : {}), ...(o.b.t.start_date ? { startDate: ... } : {}) }))`, lines 310-312).
- **Original `geo.b` index is NOT kept.** `WorldBuilding.id` is the index in `kept`, which is sorted by area desc (205-207 `order = geo.b.map((b,k)=>...).sort(area desc, k)`; `k` is the original index but `kept` entries are `{b, area, tiles}` only, 221-224) and drops buildings with < 3 tiles (223). `buildWorld` also works on `geo = straighten(rotateGeo(geoIn, angle))` (166); rotate.ts maps `geo.b` 1:1 with `{...b, p, pp}` so `t` (tags) object and order are preserved. The only stable link is `tags.id`/`osmId` (and only ~44% of buildings carry it on tile data: demo przymorze 102/230, lanciego 32/217, zielonki 19/129; demos have 0 `start_date`).
- `budynkiZGeo(geo, g, k)` works on the ORIGINAL (unrotated) `Geo` and returns `Budynek[]` WITHOUT member indices (Segment.i is internal, budynki.ts:162-174). It glues touching block segments of equal height into one `Budynek` (parySasiadow 248, `klatki = segments`), whereas the world keeps each `geo.b` as a separate `WorldBuilding` with its own entrances. Key = `osm:<tags.id of largest segment that has an id>` else `g:<lat 5dp>,<lon 5dp>,<pole>` (+`#n` on collision) (budynki.ts:329-333). So mapping WorldBuilding -> Budynek needs either a new field exposed by `budynkiZGeo` (member `geo.b` indices) or geometry matching; for the HQ also: `world.ts:352-355` FORCES HQ to be `blok`/`dom` (`b.cls = b.area < 300 ? 'dom' : 'blok'`) even if `classify` says otherwise, in which case `budynkiZGeo` has no Budynek for it.
- Small filter mismatch: world drops < 3 TILES, mieszkancy drops < 3 m2 (`MIN_POLE`, budynki.ts:72); generator filters residential by `classify`/`levelsOf` (budynki.ts:213-228) with its own POI assignment (`kategorie`, 178), world uses `cats` from POIs (world.ts:247-275); `generujObszar` area = unrotated 384 m square on building centers (generuj.ts:60-68, `POL_KWADRATU = 192`, R22), the game's world = rotated 384 m square, so a few edge buildings differ.
- Entrances (klatki in the world): `findEntrances` (world.ts:888-979): block gets `n = max(1, round(len/20))` entrances along its longer side (best-scored side), other classes 1; `b.entrances` ordered k = 0..n-1 by position along the wall (west->east for horizontal, north->south for vertical, in ROTATED coordinates). Generator side: `Budynek.klatki = typ==='dom' ? 1 : (segments>1 ? segments : max(1, round(dlugosc/20)))` with `dlugosc` = longer side of min-area rectangle (budynki.ts:274-276, 347). `Gospodarstwo.klatka` is 1-based and assigned round-robin `1 + (i % klatki)` (spis.ts:519), with no spatial meaning. Interior klatka rooms: one section per klatka ("Blok: sekcja na każdą klatkę", interior.ts:3). No code relates these three numberings.

### A4. Resident card UI and start screen

Card (src/ui/karta.ts @14326cd): `personCard(p: SimPerson, tick: number, tonight?: string, storyOpen = false): string` (55-86) returns, in order: `<h2>name`, `<p class="sub">prof, wiek`, `storyHtml(p.story, storyOpen)` (78), `.tags` (skills + traits via `nazwaCechy(t, p.f)` + 'kikut'), `armHtml` (weapon + bite/amputate, 33-46), `.needs` bars, `.moods`, `.tonight`, `.doing`. `storyHtml(story, open)` (49-53) = `<button class="story" data-card="story" aria-expanded=...><span class="story-t">...`. `groupCard(names, touch)` for multi-select. Pure functions, no DOM (tested in Node).
- Opening: click on a core pawn -> `view.pick` (view.ts:951) -> main.ts:1439-1448 `selected.add(hit.id)`; `hud()` (main.ts:697) builds `snap = snapshot(st, sim.w)`, `sel = snap.people.filter(p => selected.has(p.pawn))`, single selection -> `setCard(personCard(sel[0], st.tick, tonight(sel[0]), storyOf === sel[0].pawn))` (746); `setCard` (676) writes `#card` (`<aside class="card" id="card" hidden>`, index.html:70); button clicks via `$('card').addEventListener('click', ...)` (main.ts:949-) with `data-card` = story | arm | amputate. With nothing selected `hud` shows the FLAT card: click empty ground -> `aptFocus = aptAt(sim.w, view.tileAt(...))` (main.ts:1453/1458) -> `aptView(...)` + `aptCard(...)` (ui/mieszkania.ts:75-120: state, why/year, rooms, damages; `WHY_TEXT` sentences like "Mieszkańcy wyjechali w {rok}. Meble zostały.").
- Where a family/story line could go: (a) reuse `story?: string` on Person/SimPerson: the collapsed-one-line + expand mechanics already exist (`storyHtml`, `storyOf` in main.ts:674, CSS `.card .story` in src/ui/druzyna.css:307-348); generator `Gospodarstwo.historia?: string[]` (2-3 sentences, typy.ts:49-50) can be joined into `story`. Caveat: `.card .story { display:none }` at max-width 640px (druzyna.css:344-348), so on phones nothing shows; (b) a new row between `.sub` and `.tags` (e.g. `Rodzina: ...`, klatka); (c) the flat card (`aptCard`) could list the household of that flat (but spec says no flat numbers/floors in text, only klatka). Spec 9/10 (2026-10-17-mieszkancy-z-adresu-design.md:185-203): card = name, age, klatka, family, history, rename button; "napis, ze mieszkancy sa wymyslenie" must be on the card or under the list (so it is on screenshots), no flat numbers or floors in texts.
- Residents themselves have no card at all today (not selectable). Group card for several residents or a "Mieszkańcy" list does not exist.

Start screen (index.html @14326cd):
- 16-36 `#start > .start-card`: `#lore` (19), `#resume` (20), `.preview` ("Wersja 0.4 w budowie", 21-24), `<form id="startForm">` (25-28) containing the address `<input id="addr">` and the **mode radios** `name="tryb"` zwykly/zombie (26) -> main.ts:143-152 (`setMode`, `parseMode(params.get('tryb'))`), **`<section class="druzyna" id="druzyna">`** (30; between comment markers 29/31; rendered by `src/ui/druzyna.ts`), `#demos` (32; buttons built in main.ts:160-171 from `demo/index.json`), `#startStatus` (33), `<p class="fine">` data/attribution (34).
- Panel "Wasz zarząd" (see B): `new Druzyna(druzynaEl)` main.ts:153-156 (`druzyna` null if block missing); `druzyna?.opcje() ?? { core: 4 }` is spread into `createSim` (main.ts:237). A "mieszkańcy z adresu" switch would fit (i) as another radio next to `tryb` (index.html:26, handled like main.ts:143-152), or (ii) inside the panel (`htmlPanelu` druzyna.ts:216-248 / `StanDruzyny` 60-67, persisted under localStorage key `za-murem-0.4-druzyna`), or (iii) a new field next to `core`/`team` in `opcje()`. Naming clash: the panel's "z adresu" mode (podsumowanie(): "N osoby, losowo z adresu", button "Wróć do losowania z adresu", druzyna.ts:149-155, 225) means "makePerson seeded by the address hash", NOT the mieszkancy generator.

### A5. Address loading, lat/lon, Nominatim, where async happens

- `src/world/load.ts`: `loadAddress(q: string, status: (s: string) => void): Promise<Loaded>` (36-55): `geocode(q)` (osm.ts:32-48, `GeocodeResult {lat, lon, label, area, street, city}`; request is `format=jsonv2&limit=1&addressdetails=1&accept-language=pl`; `a = j[0].address || {}` is read at osm.ts:38 but only `area` (neighbourhood|quarter|suburb|city_district|village|town|city), `street` (a.road), `city` (city|town|village) are kept; **no state/county/TERYT is extracted**, `label = display_name` full string), then `loadTiles(g.lat, g.lon, LOAD_RADIUS, ...)` (mvt.ts `load`) and on failure Overpass `toGeo(json, g.lat, g.lon)` (osm.ts:161). LOAD_RADIUS = ceil(384/2*1.5) = 288 (world.ts:26).
- `Loaded {geo: Geo, name, addr (=label), street, src: 'demo'|'mvt'|'overpass'}` (load.ts:9-15). lat/lon are NOT in `Loaded`; they live in `geo.c = [lat0, lon0]` (set to the geocoder point by `toGeoT`/`toGeo`, and `Geo.c` for demos; demo JSON also has top-level `lat`/`lon` but `loadDemo` (24-29) drops them). `Loaded` is persisted whole in `Save.data` (zapis.ts:19), so extra fields (teryt, wojewodztwo) would persist and `geo` allows deterministic regeneration after a reload.
- Flow in main.ts: `start(get, saved?)` (199-217): `const data = await get()` (203, geocode+tiles) -> `status('Rysuję osiedle…')` -> `await enter(data, saved)` (206). `enter` (221-320) is declared `async` but has NO `await` inside; order: seed (223) -> `buildWorld(data.geo, { seed, street: data.street })` (225) -> `buildScene` -> stale-save check `worldKey` (231) -> `createSim(world, seed, {...})` (237) -> `new Sim(world, st)` (250). Natural slots for async table loading: (1) after `await get()` in `start` (203-206), or (2) at the top of `enter` before 225 (make it truly async; the comment at 235 says "wszystko, co może się nie udać, przed przełączeniem ekranu: błąd zostaje na ekranie startowym"). Resume path: `start(async () => resume.data, resume)` (181) goes through the same `enter`.
- Tables loaders already async + `fetch`-injectable (src/mieszkancy/wczytaj.ts, base dir `data/mieszkancy/` relative, `base: './'`): `wczytajGmine(teryt: string, fetchFn=fetch): Promise<TabeleGminy|null>` (54; needs 7-digit TERYT, 404 -> null silently), `wczytajKraj(fetchFn): Promise<TabeleKraju>` (61, THROWS on failure), `wczytajImiona(fetchFn): Promise<TabeleImion|null>` (76), `wczytajNazwiska(woj, fetchFn)` (82), `wczytajNazwiskaDlaGminy(g, fetchFn): Promise<TabeleNazwisk|null>` (98), `wczytajOdmiane(fetchFn): Promise<TabelaOdmiany|null>` (109), `wczytajKoncowki(fetchFn): Promise<TabelaKoncowek|null>` (121). Files in public/data/mieszkancy/: kraj.json, imiona.json, odmiana.json, odmiana-koncowki.json, nazwiska/<woj>.json (16), gminy/{1206172,1465138,2261011}.json, LICENCJE.md.
- **No address -> TERYT mapping exists in the game.** Only 3 gmina tables (Zielonki, Warszawa-Ursynow, Gdansk). tools/mieszkancy.ts:12-13,46,281-291 picks the gmina by `rejonDla(g, lat, lon)` over all table files, with `ZAPAS_TERYT = { przymorze:'2261011', lanciego:'1465138', zielonki:'1206172' }` (tools only). In the game any other address => `g = null` => national template + `nazwiskaDlaGminy(null)` = mazowieckie without local pool (R35). The browser has no index to know which gmina file to fetch (step 6, "cala Polska w tabelach", is separate).
- Generator call shape (src/mieszkancy/generuj.ts): `generujObszar(geo: Geo, g: TabeleGminy|null, k: TabeleKraju, nazwy?: Nazwy): Osiedle` (103) where `Nazwy {imiona: TabeleImion; nazwiska: TabeleNazwisk; odmiana?: Odmiana; kronika?: WpisKroniki[]}` (34-39; `Odmiana = {tabela, koncowki}` from wczytajOdmiane/wczytajKoncowki); `generujBudynek(b: Budynek, g, k, nazwy?): WynikBudynku` (50); `budynkiObszaru(geo, g, k): Budynek[]` (60); `kronikaObszaru(geo, budynki, imiona): WpisKroniki[]` (94); `Osiedle {wersja, rok:2051, teryt, budynki: WynikBudynku[]}`; `budynkiZGeo` in budynki.ts:301. Histories (`Gospodarstwo.historia`) only appear when `nazwy.odmiana` and kronika are given. `odmien(imie: string, plec: Plec, t: TabelaOdmiany, k: TabelaKoncowek): {formy: Formy; pewne: boolean}` (odmiana.ts:536; `Formy = Record<'mian'|'dop'|'cel'|'bier'|'narz'|'msc'|'wol', string>`), `formyNazwiska(meskie, t, k)` (572). Fachy: `nazwaFachu(id: IdFachu, plec: Plec): string` (fachy.ts:464), `fachOsoby(o: Pick<Osoba,'fach'>): Fach|undefined` (460; `Fach {id, m, k, umiejetnosci: Partial<Record<Dom, number>>, odWieku}`), `zawodOsoby` (470).
- Generator types (typy.ts): `Osoba {id, plec:'M'|'K', rocznik, imie, nazwisko (empty without name tables), matka?, ojciec?, partner?, stan:'tu'|'wyjechal'|'zmarl', dokad?, dawnyZawod?, fach?}` (25-42); `Gospodarstwo {id, budynek (=Budynek.klucz), klatka (1-based), czlonkowie: string[] (Osoba ids), odOddania, historia?: string[]}` (43-51); `Budynek {klucz, lat, lon, rejon, typ:'dom'|'blok', kondygnacje, pole, szerokosc, dlugosc, klatki, startDate?, epoka?, mieszkania?}` (52-66); `WynikBudynku {budynek, osoby, gospodarstwa, dziennik: Wpis[], puste: number, rok?}` (67-75).
- Performance note from POSTEP: whole area with names+kronika+histories 63 ms Przymorze, 91 ms Ursynow, 6 ms Batowice (Node). Spec target <=200 ms on phone, off render thread (not measured on a phone).

### A6. Attribution UI

- In game (always visible): `index.html:78` `<div class="attrib">© <a ...openstreetmap.org/copyright>współtwórcy OpenStreetMap</a> · <a ...openfreemap.org>OpenFreeMap</a> · <a ...openmaptiles.org>OpenMapTiles</a></div>`; CSS `src/style.css:491-503` (`.attrib {position:absolute; right:8px; bottom:8px; font-size:12px; background: rgb(20 22 24 / 0.8); padding:2px 8px; ...}`). CLAUDE.md:36 hard rule: "Atrybucja map zawsze widoczna". No attribution code in main.ts (static HTML).
- Start card: `index.html:34` `<p class="fine">Adres trafia do wyszukiwarki OpenStreetMap (Nominatim), mapę pobieramy z ... OpenFreeMap ... Dane mapy © współtwórcy OpenStreetMap, kafelki © OpenMapTiles.</p>`. The druzyna work verified the attribution still fits the first screen (POSTEP: "atrybucja mapy kończy się na 853 px z 900", phone `start-telefon` form ends at 834/844): any extra line on the start card must keep that.
- There is NO "O grze" screen yet. public/data/mieszkancy/LICENCJE.md (generated from tools/dane/licencje.ts, do not hand-edit) already contains "Linia do ekranu „O grze”": "Dane demograficzne: GUS (NSP 2021 ..., BDL na CC BY 4.0, BREC 2021, tablice trwania życia 2025, Prognoza ludności 2023-2060, Rocznik Demograficzny 2025, Sytuacja demograficzna Polski do 2025 r.) i Eurostat (CC BY 4.0), przetworzone na wymyślonych mieszkańców; imiona i nazwiska: rejestr PESEL, Ministerstwo Cyfryzacji, dane.gov.pl (CC0); odmiana: SGJP (BSD-2, pełna nota w repozytorium)." plus the BSD-2 SGJP note. Candidate places for the line: second `.attrib` span next to the map credits (index.html:78, must still fit narrow screens), `index.html:34` `.fine`, the in-game Menu sheet note (`menuSheet(note)` ui/okna.ts:304-316, `<p class="fine">`) or Help sheet (`helpSheet` okna.ts:352-364). Spec §11: "Linia do ekranu z informacjami o grze, obok atrybucji map".

### A7. Is src/mieszkancy imported anywhere outside tests/tools? Golden digests

- `git grep "mieszkancy/" 14326cd -- src index.html vite.config.ts package.json` (excluding src/mieszkancy itself) = **no hits**. src/mieszkancy imports only from `../world/classify.ts`, `../world/geo.ts`, `../core/rng.ts`, `../content/data.ts` (types), `../content/people.ts` (`g`, `wiek`, in szablony.ts:36). Used by: tests/unit/mieszkancy-*.test.ts (15 files) + tools/mieszkancy.ts, tools/dane-*.ts, tools/dane/*. Module ~8 700 lines in 24 files. `npm run mieszkancy` is the CLI.
- Golden digests tests/unit/mieszkancy-generuj.test.ts:211-240 (`describe('złote skróty...')`), `SKROTY` at 220-224, comment 214-219:
  ```
  przymorze: 'af61982a41d56807726e8c525a8da03f824f5b025f4d6f01961270b2748f15ed'
  lanciego:  '150efa7fdc7620117cf513b4589bd2edfd0f0bef0638a0f47cdc437a7803095e'
  zielonki:  '00aae2a4e31094060dcd3332cb7f36701f83ec2eb7abcb8e368b239a58bf40dd'
  ```
  (sha256 of `JSON.stringify(generujObszar(demo, gmina, kraj, pelneNazwy))`, 'WERSJA_GENERATORA' = 1). **Yes, they were rewritten on pelna-gra**: the merge commit 59519d4 changed them from the mieszkancy-branch values `6b2cc447ed97…/aebbf97a1b11…/74956defb9ba…` (7e45ef4) because the pelna-gra demos carry OSM ids (so keys became `osm:<id>`), with the comment "bez podbicia wersji" added. Likewise `mieszkancy-budynki.test.ts` key regex relaxed to `^(osm:[nwr]\d+|g:...)$` (line 115). Also pins `losDla('a',1)` first three numbers [0.9250533184967935, 0.6815912965685129, 0.02749735489487648] (line 236).
- Known failing-by-design test: `it.fails('budynki do 150 m od adresu mają przy adresie 40 m dalej ten sam klucz, mieszkania i epokę', ...)` at tests/unit/mieszkancy-budynki.test.ts:188 (comment ~170-187; on tiles, 3 of 40 buildings keep the same key in both loads, per budynki.ts header lines 6-11). Fix = canonical geometry/key from importer (R24, R51); after the fix `it.fails` must be flipped (line ~184 says "zdjąć `it.fails`"). Note the test also asserts same `mieszkania` and `epoka`, which derive from rounded geometry (`pole`, widths), not only from the key.
- Other digests that a default-path change in `createSim` would break (so gate step 5 behind an option or re-pin): tests/unit/druzyna-sim.test.ts:32-61 `PRZED` map (28 hashes e.g. 'przymorze zwykly 4 start': 'e37c3cbd', computed with `createSim(world(seed 3), 7, {core, mode})`), tests/unit/sim.test.ts:38 (10-day hash), tests/unit/zarzad.test.ts, `npm run bot` (POSTEP: da4b24e0 day 46 / dad44c81 after 3 days) and `npm run bot:zombie` (8c90e51f / 0609ffd4), snapshot.test.ts. `tools/shots.ts` scenarios (start, start-telefon, druzyna-*).
- Planned step-5 text (plan 2026-10-18-mieszkancy-z-adresu.md:406-408; POSTEP "Następne" 7): integration = board and HQ residents from HQ households, person card with family/history/rename with odmiana and fiction notice, attribution; hard precondition R51/R24: importer gives canonical id/geometry so key, flats, epoch are identical from any nearby address; "rusza src/sim/sim.ts i src/ui" where M2 works (M2 wave 1 is already in pelna-gra: apts, damage, builds, repair). Spec §9 (185-195): `createSim` stops using `makePerson` for the core and picks 4 persons from HQ households covering cieplo/bud/med/uprawa; residents = concrete persons with cards; "makePerson zostaje dla testów zgodności z 0.3"; saved game keeps its own people; rename shown once as "wyprowadził się" if the person vanished after an update (§9, 193); RODO §10 (no flat numbers, only klatka; fiction notice visible).

---------------------------------------------------------------------------------------------------

## B. The team ("druzyna") feature = `59519d4..14326cd` (now inside pelna-gra)

Spec: docs/superpowers/specs/2026-10-18-druzyna-design.md (167 lines) — key decisions:
- Panel "Wasz zarząd" on the start card below the address, collapsed to one line by default (also on desktop, so attribution/demos fit; anti-goal: no click-through before playing; phone `start-telefon` must keep the address field on the first screen). Number of people 1-5 (default 4); two modes: **"z adresu"** (default; board drawn from the address seed after loading, only N of them) and **"własny"** (team drawn in the panel, each person editable; "Wróć do losowania z adresu" keeps own team in browser memory).
- Person: name+surname <=40 chars (first word = `first`), sex, age within the profession's `PROFS` age range, profession from 22 `PROFS` (form by sex), skills only from the profession's closed list (`UMIEJETNOSCI_ZAWODU`, 2-3 domains with max level, level 4 only in main domain), total <= `BUDZET` = 6 points; joke professions (ESG advisor, prompt engineer, courier, cook) are weak through low maxima; traits only drawn (1 or 2 at 45%, never two good, no `TRAIT_PAIRS`), re-rollable; story <=400 chars, "Wylosuj historię".
- `createSim` gets the team as explicit input, sim re-validates (`bledyOsoby`; bad person falls back to address-drawn one + console.warn); draws keep the same order so residents/spawns stay the same as without team (digest test `druzyna-sim.test.ts`). `Person.story?` and `SimPerson.story?`. Save already contains people, so `zapis.ts` unchanged. Arms from `START_KIT[mode].core` go to the first N people, rest to store (decision 8). Stories: game-card only, collapsed to one line; "Wielkie Wylogowanie 2034" lore proposed in the spec was NOT adopted (POSTEP decision 9 rejected; generations counted from year zero 2026).
- Spec explicitly says the sentence pieces use `{g:męska|żeńska}` like mieszkancy/szablony.ts so they can be moved there; "Odmiana imienia wpisanego przez gracza nie jest częścią tego projektu (jest w projekcie mieszkańców z adresu)".

createSim option (sim.ts:629-643, 744-745, 830-841):
```ts
team?: readonly OsobaDruzyny[];                          // up to 5; length REPLACES opts.core
const team = druzynaDoGry(opts.team);                    // unknown[] | null (>5 -> first 5 + console.warn)
const core = team ? team.length : (opts.core ?? 4);
// ... the normal makePerson loop runs with the normal draws ...
team?.forEach((o, k) => { const why = bledyOsoby(o); if (why.length) { console.warn(...); return; }
  Object.assign(st.people[k], osobaDoGry(o as OsobaDruzyny)); });
```
Override semantics: only `PolaGry = Pick<Person,'first'|'name'|'f'|'prof'|'skills'|'age'|'traits'|'story'>` (content/druzyna.ts:334) are assigned onto the already-created `st.people[k]`; `id` ("s<n>"), `home`, `assign`, sick/dead/gone, the pawn, needs, position, bed ownership and weapon (`kit.core[k]`) stay as drawn. `osobaDoGry` (338-354): cleaned name, `first = pierwszeImie(name)`, `prof = nazwaZawodu(o.prof, o.f)` (sex form), skills without zeros, traits copied, `story` only if non-empty. Invalid person keeps the address-drawn one. Weapons beyond headcount: `st.store.arms = [...kit.store, ...kit.core.slice(core).filter(Boolean)]` (748).
```ts
export interface OsobaDruzyny { name: string; f: boolean; age: number; prof: string /*male PROFS name*/;
  skills: Partial<Record<Dom, number>>; traits: string[]; story: string; ziarno?: number /*sim ignores*/ }   // druzyna.ts:28-44
```
Other exports of src/content/druzyna.ts: BUDZET=6, OSOB_MIN/MAX=1/5, OSOB_DOMYSLNIE=4, IMIE_MAX=40, `UMIEJETNOSCI_ZAWODU` (52), `ZAWODY_ZARTY`, `CECHY_DOBRE/ZLE/OBOJETNE`, `nazwaCechy(t, f)` (123, female trait names), `POTRZEBNE`=[cieplo,bud,med,uprawa], `losujCechy(rnd)`, `rozdajPunkty`, `losujOsobe(rnd, opts)`, `losujDruzyne(rnd, n)` (289), `bledyOsoby(x: unknown): string[]` (305), `osobaDoGry`, `druzynaDoGry`, `naprawOsobe`.

src/content/historia.ts (354 lines): pure text generator for the card story.
- Inputs: `losujHistorie(rnd: Rng, o: DoHistorii): string` with `DoHistorii {f: boolean; age: number; prof: string /*male PROFS name*/; traits: readonly string[] /*TRAITS keys*/}` (312-318, 333-354). Output: 2-3 sentences, <= `HISTORIA_MAX` = 400 chars, deterministic for a given Rng.
- Tables: `FACH` (30-): zawód x pokolenie -> sentences (57 sentences total); `Z_CECHY` (237): per trait (22); `SATYRA` (286): 18 satirical details; total 97 pieces. `pokolenie(age)` (26): <=35 'mlodzi', <=55 'srodek', else 'starsi' (age in 2051). `zdaniaFachu(prof, age)` falls back to other generations. Slot syntax `{g:męska|żeńska}` filled by `wypelnijPlec(tekst, f)` (308) using `g()` from people.ts; no names in sentences, no real people/firms/places, no dashes. `historiaZ(ziarno, o)` in druzyna.ts (250) = `losujHistorie(mulberry(ziarno), o)`.

src/ui/druzyna.ts (467 lines) + druzyna.css (348) + index.html block `#druzyna`:
- State: `StanDruzyny {n: number; wlasny: boolean; team: OsobaDruzyny[]}` (60-67), `Widok {open, sel}`; localStorage key `DRUZYNA_KEY = 'za-murem-0.4-druzyna'` (56), payload `{v:1, n, wlasny, team}`; bad memory repaired by `naprawOsobe`.
- `opcjeGry(s): { core: number; team?: OsobaDruzyny[] }` (104-110): mode "z adresu" -> `{core: s.n}`; mode "własny" -> first n people (without `ziarno`) as `team` + `core: team.length`. `Druzyna.opcje()` (304) is what main.ts:237 spreads into `createSim`.
- Panel `htmlPanelu(s, w)` (216-248): collapsed: title + `podsumowanie(s)` ("4 osoby, losowo z adresu" / "własny: Halina, Rafał…") + "Zmień"; expanded: radios `dzN` 1-5, buttons "Stwórz własny zarząd" (mode own) or "Losuj wszystkich" + "Wróć do losowania z adresu", chips per person (in "z adresu" mode placeholders "Osoba k / losowo z adresu"), editor (`editor()` 180-212: name, sex radio K/M, age (min-max of profession), profession select, skills ± with pips and "zostało X z 6", "Losuj cechy", story textarea with counter + "Wylosuj historię", "Gotowe", "Losuj całą osobę"). A drawn story is recomposed from `ziarno` when sex/age/profession/traits change until the player edits it by hand. Escape closes the editor.
- main.ts: `const druzyna = druzynaEl ? new Druzyna(druzynaEl) : null` (153-156); no `#druzyna` element => old behaviour `{core: 4}`.

src/ui/karta.ts changes (diff): header comment; `import { nazwaCechy } from '../content/druzyna.ts'`; new `storyHtml(story, open)` (49-53); `personCard(p, tick, tonight?, storyOpen = false)` gains 4th param; story rendered between `.sub` and `.tags` (78); traits now through `nazwaCechy(t, p.f)` (feminine forms, also for address-drawn persons). main.ts: `let storyOf = -1` (674) = pawn id of the person whose story is expanded (other person => collapsed again); `data-card="story"` click toggles (956-959); `hud()` passes `storyOf === sel[0].pawn` (746). CSS `.card .story*` (druzyna.css:307-348): one line with ellipsis + ▾/▴; hidden at <=640 px.

Tests/tools added: tests/unit/druzyna.test.ts (429), druzyna-sim.test.ts (265), druzyna-panel.test.ts (199); tools/bot-zombie.ts 3rd arg = number of board people; tools/shots.ts scenarios (druzyna-*, start-telefon kept). CLAUDE.md line 84 documents the panel.

---------------------------------------------------------------------------------------------------

## C. mp-serwer (1c0302a): canonical building keys

Branch facts: 10 commits on top of merge-base 261714c, which predates swiat-id-budynkow and mieszkancy on pelna-gra. Includes its own copy of "Identyfikator OSM i data budowy" (3136c59: osmIdOf, `tags.id`, KEEP+start_date, `WorldBuilding.osmId/startDate`). `git merge-tree` (3-way, nothing written) shows 12 conflict hunks if merged into current pelna-gra: src/world/mvt.ts (5), docs/POSTEP.md (3), tests/unit/world-port.test.ts (2), src/world/osm.ts (1), CLAUDE.md (1); world.ts and geo.ts merge cleanly. Stage 1 only: **the game does not use the keys yet** (no import of klucze/net in main.ts, sim, ui, render); consumers are server/, src/net/ and tests (`klucze.test.ts`, `api-klient.test.ts`, `serwer.test.ts`). Demos on mp-serwer have NO `zm:` tags (0/230 on przymorze) so `kluczeSwiata(...)` is all-null for demos (klucze.test.ts:179-190 asserts it), and the spec says multiplayer is real-address only.

`src/world/klucze.ts` (290 lines) exports (all pure; imports only `Pt` from geo.ts and types from world.ts):
```ts
export const Z_KLUCZY = 14;  export const KAFEL_PX = 4096;  export const KLATKA_M = 20;
export type LatLon = readonly [number, number];
export type TagiKlucza = { 'zm:klucz': string; 'zm:os': string };
export interface Klatka { klucz: string; budynek: string; nr: number; lat: number; lon: number }          // lat/lon rounded 1e-6
export interface KluczeBudynku { budynek: string; klatki: Klatka[]; wejscia: string[] /*per b.entrances, same order*/ }
export function pikselZ(lat: number, lon: number): Pt                                   // 75  Mercator -> global px at z14 (uses Math.sin/Math.log)
export function latLonZ(x: number, y: number): [number, number]                         // 81
export function tagiKlucza(pierscienie: readonly (readonly Pt[])[]): TagiKlucza | null  // 114  rings in GLOBAL PIXELS; null if degenerate
export function kluczBudynku(b: Pick<WorldBuilding,'tags'>): string | null              // 183
export function liczbaKlatek(b: Pick<WorldBuilding,'tags'>): number                     // 188  max(1, round(axisLen_m / 20)); 0 without tags
export function klatkiBudynku(b: Pick<WorldBuilding,'tags'>): Klatka[]                  // 200  key `${budynek}/${nr}`, nr from 1 from the WEST end of the axis
export function pikselWejscia(w: Pick<World,'size'|'angle'>, e: Entrance, srodek: LatLon): Pt   // 216 undoes grid rotation like rotateGeo
export function nrKlatki(b: Pick<WorldBuilding,'tags'>, p: Pt): number                  // 230 projection on axis; 0 without tags
export function kluczWejscia(w, b, e: Entrance, srodek: LatLon): string | null          // 242
export function kluczeSwiata(w: Pick<World,'size'|'angle'|'buildings'>, srodek: LatLon): (KluczeBudynku | null)[]  // 254 index = w.buildings index
export function prostokatMapy(w, srodek, zapasM = 150): { s: number; w: number; n: number; e: number }          // 268
```
Key format: `zm:klucz` = `px:X:Y:DX:DY` where (X,Y) = topmost vertex (ties: westmost) of the outline in global z14 pixels (4096 px/tile, ~0.35 m) and (DX,DY) = offset to the bottom-most vertex (ties: eastmost); integers print bare, others with 2 decimals (`liczba`, line 90). `zm:os` = `x1,y1,x2,y2` (toFixed(2)) longer axis of the minimum-area enclosing rectangle through its center, ordered west->east (north->south when exactly vertical) (lines 163-170). Only + - * / sqrt in the tag math (convex hull by Andrew monotone chain + rotating min-area rectangle), strings via toFixed, hence engine-independent; caveat (my reading): the Overpass path calls `pikselZ` (Math.sin/Math.log) before `Math.round`, so a vertex on a pixel rounding boundary could in principle differ between engines.

Where tags are set (mp-serwer):
- Tiles: `src/world/mvt.ts` `toGeoT`: building rings kept in global px: `G = ([px,py]) => [T.x*KAFEL_PX + px*gs, T.y*KAFEL_PX + py*gs]` with `gs = KAFEL_PX/E` (mvt.ts:560-561; fields `g`, `gg` added to `BTmp`); after gluing of cross-tile pieces: `const kl = tagiKlucza([b.g, ...b.gg]); if (kl) Object.assign(tags, kl);` (mvt.ts:640-642). Geometry `p` is still rounded to 0.5 m relative to map center, but keys come from the exact px outline, so they are address-independent. One key per glued tile-building.
- Overpass: `src/world/osm.ts` `toGeo` (185-188): `tags.id = 'w'+el.id` (ways only; relations are not handled) and `const kl = tagiKlucza([el.geometry.map((g) => pikselZ(g.lat, g.lon).map(Math.round) as Pt)]); Object.assign(tags, kl)`. **Overpass buildings do get keys on the same grid** and equal the tile key for 39/40 Przymorze buildings, axis for 36/40 (spec line 60; tests klucze.test.ts:242-274 require >85% same key, >75% same axis). Fallback matching: a taken klatka on the server whose centre lies within 6 m of mine counts as taken (spec line 75).
- Not set for: demos, saves from before, the procedural fallback `genProc` ("osiedle zapasowe").
- Server/protocol side: `src/net/protokol.ts:20-24` `KLUCZ_BUDYNKU_WZOR = /^[a-z][a-z0-9]{0,7}:-?\d+(\.\d+)?(:-?\d+(\.\d+)?){1,5}$/`, `KLUCZ_KLATKI_WZOR = /^([a-z][a-z0-9]{0,7}:[0-9.:-]+)\/([1-9]\d{0,2})$/`, `KLUCZ_MAX = 96`. NOTE: the generator's current keys (`osm:w123`, `g:54.40930,18.59910,500`, `…#2`) do NOT match these patterns; they are a different key space from `px:`.

Spec docs/superpowers/specs/2026-10-18-multiplayer-design.md (167 lines), key decisions about keys (§"Klucze budynków i klatek", lines 41-62, and Etap 2 line 140):
- Building number / tiles / doors depend on map centre, grid rotation and 0.5 m rounding, so unusable as keys; OSM id alone is not enough (OpenFreeMap glues same-attribute buildings into one object without id: ids on only 25/64 Przymorze, 8/42 Zielonki test buildings) => pixel-outline keys.
- Klatki = max(1, round(axis length/20 m)) of equal length along the axis, independent of the world's building type (type depends on raster; differs between two players for ~3% of buildings); klatka key = `<building key>/<n>` from 1 from the west end; klatka position = centre of its axis segment (lat/lon), server answers rectangle queries by it. World doors (`Entrance`) are mapped to the klatka containing their projection on the axis; verified in 86-95% of buildings fully on both maps (equal door count and klatka count), failures = shops/schools/halls (one door, several klatki) and blocks where `findEntrances` rounds raster length differently.
- Weak spots: building cut by tile border far from one player, OSM outline edit changes the key, demos and old saves have no key.
- Etap 2 plans `findEntrances` to take count and positions of klatki from `zm:os` (world change => old saves restart, `worldKey` changes).
- Determinism: keys are a pure function of world+tags; server data enters the sim only as explicit start input (`createSim(w, seed, { siec: { bezDomu, obce } })`) and queued commands; sim never imports `src/net`.

How klucze.ts relates to the generator (for step 5):
- Same 20 m rule: `liczbaKlatek` (axis/20) is the same formula as `klatkiBloku` for a single outline (min-area rectangle's long side / 20), but differs for (1) glued OSM segments (generator: klatki = number of segments; klucze: one key per `geo.b`, so each OSM way/segment is its own "building" with its own axis), (2) houses (generator 1; klucze round(len/20), =1 below 30 m), (3) non-residential. Generator klatka numbering is round-robin without geometry (`1 + i % klatki`), klucze numbering is spatial west->east.
- `budynkiZGeo` today computes `pole`, `szerokosc`, `dlugosc` from the 0.5 m-rounded, centre-relative geometry, so even with a canonical key the geometry-derived `mieszkania`/`epoka` can drift (the `it.fails` test also asserts equal `mieszkania` and `epoka`). `zm:os` fixes only length/orientation; pole would need the pixel outline (not carried in `Geo`).
- Replacing/augmenting `Budynek.klucz` with `tags['zm:klucz']` when present (fallback `osm:`/`g:`) and keying seeds by it would make `losDla('imiona'|'fachy'|'historie', klucz, ...)` identical across addresses, but all golden digests (A7) change at that moment.

---------------------------------------------------------------------------------------------------

## D. Quick risk / decision list for the step-5 plan (my observations, not decisions)

1. Branch base: pelna-gra now = 14326cd (includes druzyna). origin/pelna-gra is behind (59519d4).
2. mp-serwer merge into pelna-gra conflicts in mvt.ts/osm.ts (swiat-id-budynkow vs its copy); order of merges decides who owns the importer change that step 5 (R24/R51) needs.
3. Residents are anonymous pawns tied to flats; giving them identity = either `Pawn.person` -> new `Person` (fallbacks exist at sim.ts:4215/4327, main.ts:1046) plus making `view.pick`/`main.ts` selection and `snapshot.people` (core-only) accept residents, or a separate resident list.
4. Mapping layers needed: (a) WorldBuilding <-> Budynek (no geo index kept; HQ forced to blok/dom), (b) klatka numbering (generator round-robin / segments vs world entrances vs interior klatka rooms vs future `px:.../n`), (c) households <-> HQ ground-floor flats (apt ids exist only after buildInterior; flat count unrelated to `Budynek.mieszkania`; only `puste` count and 'opuszczone' dziennik entries describe empties).
5. `settleApts(given)` has no "at least one inhabited reachable flat" guarantee; `createSim` residents count is derived from flat count (3-8), not households.
6. Tables are async and TERYT lookup does not exist: only 3 gminy; others use `g = null`. Loader hook points: main.ts `start` (203-206) / `enter` (221, no awaits today).
7. Pinned digests (A7) will change on any default-path change: gate behind an opt (like `team`) or re-pin; `worldKey` does not cover apts/damage.
8. UI: story/family line can ride on `Person.story` (collapsed one-liner exists, hidden <=640 px); fiction notice + data attribution line (LICENCJE.md text) have no home screen yet ("O grze" does not exist); `.attrib` / `.fine` / Menu sheet are the candidates.
9. Naming: panel mode "z adresu" in druzyna.ts is the old seeded makePerson draw; consider renaming when the generator becomes the "z adresu" source.
10. Age convention differs (fachy.ts: 2051 - rocznik; tools: 2050 - rocznik) and generator gives no traits.
