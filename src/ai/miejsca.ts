/* Miejsca dla silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 3): w którym pokoju
   śpi zarząd i gdzie stanie budowla. Warstwy silnika (zima, jedzenie, rozwój) pytają tylko o to, a o stan gry czytają
   jak gracz: ze `SimState` i świata, bez żadnej pamięci i bez rąk. Funkcje są czyste i niczego nie zmieniają.

   `pokojZarzadu` to pokój mieszkania zarządu, w którym stoi najwięcej łóżek z właścicielem z zarządu (zarząd śpi we
   własnych łóżkach, a gdy ich nie ma, na podłodze pokoi swojego mieszkania: `startSleep` w src/sim/sim.ts). Remis
   rozstrzyga niższy numer pokoju; bez łóżek z właścicielem z zarządu to pierwszy pokój mieszkania; bez wnętrza albo bez
   pokoju w mieszkaniu zarządu −1. Nie zakłada klatki ani bloku: w domu jednorodzinnym (Zielonki) pokoje to po prostu
   pokoje mieszkania zarządu.

   `miejsceNa` to pierwsze miejsce w kolejności kafelków (obrót 0 przed 1), które `canPlace` przepuszcza, tak jak
   `placeFor` w tests/unit/m2-play.ts: w pomieszczeniach naszych mieszkań dla budowli z miejscem pokój, kuchnia, łazienka
   albo okno (koza z beczki), na klatce siedziby (kocioł; w domu przedpokój), na podwórku, a dla zasieków i barykady
   na dziurach siatki i na jej odcinkach. Z podanym pokojem szukanie zawęża się do kafelków tego pokoju (miejsca spoza
   pomieszczeń, czyli podwórko i obwód, zostają bez zmian). Budowla zamknięta badaniem albo limitem nie ma miejsca.
   Czego `canPlace` nie sprawdza, a `miejsceNa` tak: przy obrysie musi zostać wolny kafelek do stania (bez ściany, mebla,
   budowli i planu, jak `beside` w src/sim/sim.ts), bo budowla ze wszystkich stron zastawiona nie ma skąd być budowana,
   obsługiwana ani badana (plan stałby na zawsze, a stół pracowni nie miałby przy sobie nikogo). Opcjonalny
   `unikaj` to kafelki, których obrys ma nie zajmować (miejsca, które ktoś jeszcze będzie potrzebował, np. przy oknie
   dla kozy): `miejsceNa` bierze pierwsze miejsce omijające je, a gdy takiego nie ma, pierwsze w ogóle. `miejscaNa`
   to wszystkie miejsca po kolei (z dostępem do stania), bez `unikaj`. */

import { BUILDS, type BuildKind, boilerRooms, canPlace, footprint, GHOST_KINDS, PLACE_ROOMS } from '../sim/budowle.ts';
import { houseOf } from '../sim/house.ts';
import { fenceShape } from '../sim/perimeter.ts';
import type { SimState } from '../sim/sim.ts';
import type { World } from '../world/world.ts';

/** łóżka z kontraktu wnętrza: te same rodzaje, na których zarząd śpi w symulacji */
const LOZKA = new Set(['lozko', 'wersalka', 'lozka_pietrowe']);

/** Pokój (indeks w `houseOf(w).rooms`), w którym śpi najwięcej osób zarządu: najwięcej łóżek z właścicielem z zarządu
    w mieszkaniu zarządu, remis rozstrzyga niższy numer pokoju. Bez takich łóżek pierwszy pokój (rodzaj `pokoj`) mieszkania
    zarządu; −1, gdy świat nie ma wnętrza albo mieszkanie zarządu nie ma pokoju. */
export function pokojZarzadu(st: SimState, w: World): number {
  const h = houseOf(w);
  if (!h) return -1;
  const size = w.size;
  const rdzen = new Set(st.pawns.filter((p) => p.kind === 'core').map((p) => p.id));
  const lozka = new Map<number, number>();
  for (const t of st.things) {
    if (!LOZKA.has(t.kind) || !rdzen.has(t.owner)) continue;
    const r = h.room[t.y * size + t.x];
    if (r < 0 || h.rooms[r].apt !== h.home) continue;
    lozka.set(r, (lozka.get(r) ?? 0) + 1);
  }
  // najwięcej łóżek, przy remisie niższy numer pokoju (kolejność mapy nie ma znaczenia)
  const pokoje = [...lozka.keys()].sort((a, b) => lozka.get(b)! - lozka.get(a)! || a - b);
  if (pokoje.length) return pokoje[0];
  return h.rooms.find((r) => r.kind === 'pokoj' && r.apt === h.home)?.id ?? -1;
}

/** rzeczy leżące luzem (materiały, zapasy, sterty): nie zajmują kafelka do stania, jak LOOSE w src/sim/sim.ts */
const LUZEM = new Set(['drewno', 'jedzenie', 'posilek', 'pien', 'czesci', 'leki', 'deski', 'zlom', 'gruz', 'smieci']);

export interface Miejsce {
  x: number;
  y: number;
  rot: number;
}

/** kafelki zajęte przez meble, budowle i plany (bez rzeczy luzem i śladów, po których się chodzi): na nich się nie stoi */
function zastawione(st: SimState, size: number): Set<number> {
  const out = new Set<number>();
  const dodaj = (x: number, y: number, w: number, h: number): void => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.add((y + dy) * size + x + dx);
  };
  for (const t of st.things) if (!LUZEM.has(t.kind) && !GHOST_KINDS.has(t.kind)) dodaj(t.x, t.y, t.w, t.h);
  for (const b of st.builds) {
    const { w, h } = footprint(b.kind, b.rot);
    dodaj(b.x, b.y, w, h);
  }
  return out;
}

/** czy przy obrysie budowli jest wolny kafelek do stania: w pierścieniu wokół obrysu (z przekątnymi, jak `beside`) kafelek
    bez ściany i bez mebla, budowli ani planu */
function maDostep(w: World, zajete: ReadonlySet<number>, kind: BuildKind, x: number, y: number, rot: number): boolean {
  const size = w.size;
  const { w: bw, h: bh } = footprint(kind, rot);
  for (let yy = y - 1; yy <= y + bh; yy++)
    for (let xx = x - 1; xx <= x + bw; xx++) {
      if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
      if (xx >= x && xx < x + bw && yy >= y && yy < y + bh) continue;
      const i = yy * size + xx;
      if (!w.blocked[i] && !zajete.has(i)) return true;
    }
  return false;
}

/** kafelki, na których wolno położyć lewy górny róg budowli `kind` (przed `canPlace`), w kolejności kafelków */
function kafelkiDla(st: SimState, w: World, kind: BuildKind, pokoj?: number): number[] {
  const size = w.size;
  const hs = houseOf(w);
  const place = BUILDS[kind].place;
  const kinds = PLACE_ROOMS[place];
  const tiles: number[] = [];
  if (kinds) {
    if (!hs) return tiles;
    for (let i = 0; i < size * size; i++) {
      const r = hs.room[i];
      if (r < 0 || (pokoj !== undefined && r !== pokoj) || !kinds.includes(hs.rooms[r].kind)) continue;
      if (st.apts.find((a) => a.apt === hs.rooms[r].apt)?.ours) tiles.push(i);
    }
  } else if (place === 'klatka') {
    if (!hs) return tiles;
    const { rooms } = boilerRooms(st, hs, size);
    for (let i = 0; i < size * size; i++)
      if (hs.room[i] >= 0 && (pokoj === undefined || hs.room[i] === pokoj) && rooms.has(hs.room[i])) tiles.push(i);
  } else if (place === 'podworko') tiles.push(...(fenceShape(w)?.yard ?? []));
  else {
    for (const hole of st.fence?.holes ?? []) if (!hole.patch) tiles.push(...hole.tiles);
    tiles.push(...(fenceShape(w)?.tiles ?? []));
  }
  return tiles;
}

/** Miejsca dla budowli po kolei (obrót 0 przed 1, kafelki rosnąco): `canPlace` przepuszcza, a przy obrysie jest wolny
    kafelek do stania. Leniwie, żeby `miejsceNa` nie liczyło więcej, niż potrzeba. */
function* miejscaDla(st: SimState, w: World, kind: BuildKind, pokoj?: number): Generator<Miejsce> {
  const size = w.size;
  const tiles = kafelkiDla(st, w, kind, pokoj);
  if (!tiles.length) return;
  const zajete = zastawione(st, size);
  // obwód (zasieki, barykada) ma własne stanowisko po stronie podwórka: tam sprawdza je symulacja, nie kafelek obok
  const bezKontroli = BUILDS[kind].place === 'obwod';
  for (const rot of [0, 1])
    for (const i of tiles) {
      const x = i % size;
      const y = Math.floor(i / size);
      if (canPlace(st, w, kind, x, y, rot).ok && (bezKontroli || maDostep(w, zajete, kind, x, y, rot)))
        yield { x, y, rot };
    }
}

/** Wszystkie miejsca dla budowli po kolei (z podanym `pokoj` tylko w nim), każde z wolnym kafelkiem do stania. */
export function miejscaNa(st: SimState, w: World, kind: BuildKind, pokoj?: number): Miejsce[] {
  return [...miejscaDla(st, w, kind, pokoj)];
}

/** Pierwsze miejsce dla budowli: lewy górny kafelek i obrót, które `canPlace` przepuszcza i przy których jest wolny
    kafelek do stania, albo null. Z podanym `pokoj` (indeks w `houseOf(w).rooms`) tylko kafelki tego pokoju. Z `unikaj`
    (kafelki mapy) pierwsze miejsce, którego obrys ich nie zajmuje; gdy takiego nie ma, pierwsze w ogóle. */
export function miejsceNa(
  st: SimState,
  w: World,
  kind: BuildKind,
  pokoj?: number,
  unikaj?: ReadonlySet<number>,
): Miejsce | null {
  let pierwsze: Miejsce | null = null;
  for (const m of miejscaDla(st, w, kind, pokoj)) {
    if (!unikaj?.size) return m;
    pierwsze ??= m;
    const { w: bw, h: bh } = footprint(kind, m.rot);
    let zajmuje = false;
    for (let dy = 0; dy < bh && !zajmuje; dy++)
      for (let dx = 0; dx < bw; dx++) if (unikaj.has((m.y + dy) * w.size + m.x + dx)) zajmuje = true;
    if (!zajmuje) return m;
  }
  return pierwsze;
}
