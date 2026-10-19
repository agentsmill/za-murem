/* Most między zarządem (src/gov) a symulacją: odczyt stanu w kształcie GovInput i stosowanie GovEffects u siebie.
   Zarząd liczy, symulacja robi: zapasy to rzeczy na mapie (drewno w stosach, zapasy w kuchni, złom w stertach),
   potrzeby i nastroje to pionki, wyprawa wychodzi bramą, warta staje przy siatce, łaty zamykają dziury, a napad
   z planu odgrywają szabrownicy. To, co wymaga przeliczenia przechodniości albo dróg (warta, wyprawa, łaty), idzie
   przez kolejkę poleceń w stanie, więc działa od następnego kroku i nie gubi się przy zapisie. Nowa osoba zarządu
   (`fx.join`) i przyjęci mieszkańcy (`fx.residents`) czekają za bramą i dochodzą do siedziby w pracy 'arrive'.

   Odczyt dla dróg do zwycięstwa (src/gov/zwyciestwo.ts) idzie w tym samym `govInput`: `ludnosc` to zarząd i mieszkańcy
   siedziby, a `teren.przylaczone` to budynki, które wspólny płot (`SimState.plot`, M2 fala 2) dołączył do obwodu. Trzeci
   odczyt, `ludnosc2021` (ilu ludzi mieszkało w kwadracie domu w 2021 roku), jest z tabel mieszkańców, a nie ze stanu
   gry, więc dokłada go gra (`ludnoscSpisu2021` w src/sim/osiedle.ts, wołane w src/main.ts).

   Mieszkańcy siedziby z osobą z generatora mieszkańców (pionki `resident`, bez sąsiadów) wchodzą jako `lokatorzy`,
   w kolejności pionków, z tymi polami osoby, które zarząd czyta (`GovLokator`); bez generatora pola nie ma.

   Badania: odczyt niesie też `badania` (pracownia, liczba zbadanych technologii, eraBadan, koncowaZbadana i siecWlaczona
   dla ramy zwycięstwa), książki, techDone i wiedzę osady z src/sim/badania.ts (ta sama co na tablicy),
   a skutki książki z wydarzeń (GovEffects.books) trafiają na półkę osady przez dodajKsiazke. Odkrycia (research.at)
   i książki znalezione w przeszukaniach (bookLog) wchodzą jako `odkrycia` i `znaleziska`, z których zarząd pisze
   kronikę (src/gov/znaleziska.ts); bez badań i książek tych pól nie ma. Kozy z beczek i kocioł
   wchodzą do karty nocy jako `paleniska` (waga drewna z PALENISKA), a stojąca wieża jako `wieza`, liczba jej miejsc
   (posterunek karty).

   Tryb zombie: `horde.przy` to prawdziwy szwendacz najbliżej siatki (do 3 m od jej kafelka, `szwendaczPrzySiatce`),
   z którego karta „Szwendacz” bierze miejsce na mapie; liczone na całkowitych kwadratach odległości kafelków, bez
   Math.hypot, żeby wynik nie zależał od silnika JS. Skutek `atak` (GovEffects.atak) idzie do kolejki poleceń jako
   'attack' osoby na pionek, jak rozkaz gracza. */

import { TECH_DOMS, type TechDom } from '../content/data.ts';
import { nextRandom } from '../core/rng.ts';
import { placeOf, wordsOfWorld } from '../gov/miejsce.ts';
import type { Arm, GovEffects, GovInput, GovLokator, LawEffects, RaidResult } from '../gov/typy.ts';
import type { World } from '../world/world.ts';
import {
  dodajKsiazke,
  eraBadan,
  koncowaZbadana,
  liczbaZbadanych,
  nazwaTech,
  odkrycia,
  PALENISKA,
  siecWlaczona,
  TECH_BY,
  wiedza,
} from './badania.ts';
import { type AmmoKey, WEAPONS, type WeaponId, weaponOf } from './bron.ts';
import { dayOf, START_MINUTES, TICKS_PER_HOUR } from './clock.ts';
import { houseOf, inHomeApt } from './house.ts';
import { nearestFree } from './path.ts';
import { fenceShape, gateTiles } from './perimeter.ts';
import {
  addCore,
  addResidents,
  BURNABLE,
  dozeOff,
  infect,
  type Laws,
  LIMB,
  type Loot,
  onPlan,
  type Pawn,
  planRaid,
  postKey,
  removeCore,
  removeResidents,
  type SimState,
  STACK,
  type Thing,
  takeStock,
} from './sim.ts';
import { type SimPerson, snapshot } from './snapshot.ts';
import { modeOf } from './tryb.ts';
import { hordeSize } from './zombie.ts';

/** rodzaj broni dla zarządu: broń palna i kusza bez amunicji to gołe ręce */
export function armOf(weapon: WeaponId | null, ammo: Partial<Record<AmmoKey, number>>): Arm {
  const w = weaponOf(weapon);
  if (w.id === 'piesci') return 'brak';
  if (w.ammo) return (ammo[w.ammo] ?? 0) > 0 ? 'palna' : 'brak';
  return w.id === 'dzida' ? 'dzida' : 'wrecz';
}

/** tick dla minuty gry liczonej od północy pierwszego dnia (jak RaidPlan.at i GovEffects.away) */
export const tickOfMinute = (m: number): number => Math.round(((m - START_MINUTES) * TICKS_PER_HOUR) / 60);

/** ile palenisk pali drewno nocą, gdy stoją kozy z beczek albo kocioł: koza zarządu 1 (jeśli stoi w jego mieszkaniu)
    plus wagi nowych (kocioł 3); 0, gdy nowych nie ma, wtedy karta liczy jedną kozę po staremu */
function paleniska(st: SimState, w: World): number {
  let nowe = 0;
  for (const t of st.things) if (t.kind === 'koza_beczka' || t.kind === 'kociol') nowe += PALENISKA[t.kind];
  if (nowe === 0) return 0;
  const h = houseOf(w);
  const koza = h !== null && st.things.some((t) => t.kind === 'koza' && inHomeApt(h, t.y * w.size + t.x));
  return (koza ? 1 : 0) + nowe;
}

/** ile metrów od kafelka siatki szwendacz jeszcze „stoi przy siatce” (karta „Szwendacz”) */
export const PRZY_SIATCE = 3;

/** Szwendacz najbliżej siatki, nie dalej niż PRZY_SIATCE od jej kafelka: numer pionka i jego kafelek. Odległość to
    całkowity kwadrat różnicy kafelków (bez Math.hypot); remis rozstrzyga niższy numer pionka; null: nikogo. */
export function szwendaczPrzySiatce(st: SimState, w: World): { pawn: number; x: number; y: number } | null {
  const tiles = fenceShape(w)?.tiles;
  if (!tiles?.length) return null;
  const size = w.size;
  let best: { pawn: number; x: number; y: number } | null = null;
  let bd = PRZY_SIATCE * PRZY_SIATCE;
  for (const p of st.pawns) {
    if (p.kind !== 'zombie') continue;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    let d = Number.POSITIVE_INFINITY;
    for (const t of tiles) {
      const dx = (t % size) - x;
      const dy = Math.floor(t / size) - y;
      const q = dx * dx + dy * dy;
      if (q < d) d = q;
    }
    if (d < bd || (d === bd && (best === null || p.id < best.pawn))) {
      best = { pawn: p.id, x, y };
      bd = d;
    }
  }
  return best;
}

/** mieszkaniec siedziby dla zarządu: tylko pola `GovLokator` (bez historii, odnośnika, rodziny, nastrojów i pracy) */
const lokatorZarzadu = (p: SimPerson): GovLokator => ({
  pawn: p.pawn,
  id: p.id,
  name: p.name,
  first: p.first,
  f: p.f,
  age: p.age,
  prof: p.prof,
  skills: p.skills,
  traits: p.traits,
  needs: p.needs,
  asleep: p.asleep,
  inside: p.inside,
  tile: p.tile,
});

/** Odczyt dla zarządu: snapshot w kształcie GovInput. screen: sekundy przy ekranie od startu gry bez pauzy
    (przy 1× to tick / 20; liczy je pętla gry, bo symulacja nie wie o tempie). */
export function govInput(st: SimState, w: World, screen: number, hqName?: string): GovInput {
  const s = snapshot(st, w);
  const palenisk = paleniska(st, w);
  const wieza = st.things.find((t) => t.kind === 'wieza');
  const zombie = modeOf(st) === 'zombie';
  const przy = zombie ? szwendaczPrzySiatce(st, w) : null;
  // zbadane technologie z drzewka (identyfikatory spoza niego, np. testowe, kronika pomija) z opisem w obu językach
  const odkryte = odkrycia(st)
    .filter((o) => Object.hasOwn(TECH_BY, o.id))
    .map((o) => ({
      ...o,
      nazwa: nazwaTech(o.id),
      dzialanie: zombie ? (TECH_BY[o.id].dzialanieZombie ?? TECH_BY[o.id].dzialanie) : TECH_BY[o.id].dzialanie,
    }));
  // mieszkańcy siedziby z osobą; odczyt dla interfejsu ma też lokatorów sąsiadów, których zarząd nie widzi
  const mieszkancy = new Set(st.pawns.filter((p) => p.kind === 'resident').map((p) => p.id));
  const lokatorzy = s.lokatorzy.filter((l) => mieszkancy.has(l.pawn)).map(lokatorZarzadu);
  return {
    tick: s.tick,
    day: s.day,
    hour: s.hour,
    minute: s.minute,
    season: s.season,
    night: s.night,
    outdoor: s.outdoor,
    kitchen: s.kitchen,
    kozaLit: s.kozaLit,
    people: s.people.map((p) => ({ ...p, arm: armOf(p.weapon, s.stock.ammo), bitten: !!p.bite })),
    ...(lokatorzy.length ? { lokatorzy } : {}),
    stock: {
      wood: s.stock.wood,
      woodSklad: s.stock.woodSklad,
      woodLoose: s.stock.woodLoose,
      supplies: s.stock.supplies,
      meals: s.stock.meals,
      scrap: s.stock.scrap,
      parts: s.stock.parts,
      meds: s.stock.meds,
    },
    screen,
    fence: s.fence,
    light: s.light,
    residents: s.residents,
    cap: s.cap,
    burned: s.burned,
    hqName,
    place: placeOf(w),
    // warta, która stoi (z karty, z menu i przy kozie), bez śpiących na posterunku i bez tych na wyprawie
    guards: st.pawns
      .filter((p) => p.kind === 'core' && !p.away && p.job?.t === 'guard' && p.job.phase !== 4)
      .map((p) => ({ id: st.people[p.person].id, post: postKey(p.job!.target) })),
    ...(zombie
      ? {
          horde: {
            near: s.zombies.near,
            pressing: s.zombies.pressing,
            killed: st.tally?.killed ?? 0,
            breaches: st.tally?.breaches ?? 0,
            bites: st.tally?.bites ?? 0,
            tonight: hordeSize(dayOf(st.tick)),
            ...(przy ? { przy } : {}),
          },
        }
      : {}),
    ...(st.obcy?.napady?.length ? { napady: st.obcy.napady.map((n) => ({ kto: n.kto, tick: n.tick })) } : {}),
    dead: (st.dead ?? [])
      .filter((d) => d.kind === 'core' || d.kind === 'resident')
      .map((d) => ({ id: d.id, name: d.name, cause: d.cause, tick: d.tick })),
    // warunki zwycięstwa (src/gov/zwyciestwo.ts): ludzie pod zarządem to zarząd i mieszkańcy siedziby (tu ich liczba
    // dla dróg), a przyłączone budynki to te, które wspólny płot już dołączył do obwodu (plan w toku się nie liczy).
    // Pole `ludnosc2021` dokłada gra (main.ts)
    ludnosc: s.people.length + s.residents,
    teren: { przylaczone: st.plot?.bids.length ?? 0 },
    // badania: jedna wiedza i jedne książki dla tablicy i dla wydarzeń zarządu (src/sim/badania.ts)
    badania: {
      pracownia: st.things.some((t) => t.kind === 'pracownia'),
      zbadane: liczbaZbadanych(st),
      era: eraBadan(st),
      koncowa: koncowaZbadana(st),
      siecWlaczona: siecWlaczona(st),
    },
    books: { ...st.books },
    techDone: [...(st.techDone ?? [])],
    know: Object.fromEntries(TECH_DOMS.map((d) => [d, wiedza(st, d)])) as Record<TechDom, number>,
    // odkrycia i książki z przeszukań do kroniki (src/gov/znaleziska.ts); gra bez badań i książek nie ma tych pól
    ...(odkryte.length ? { odkrycia: odkryte } : {}),
    ...(st.bookLog?.length ? { znaleziska: st.bookLog.map((k) => ({ ...k })) } : {}),
    // kozy z beczek i kocioł: dyżur przy kozie dokłada do wszystkich, a wyliczenie drewna na noc liczy każde
    ...(palenisk > 0 ? { paleniska: palenisk } : {}),
    // stoi wieża: karta nocy dostaje posterunek „Warta na wieży” (src/gov/noc.ts) dla tylu osób, ile kafelków ma jej
    // obrys (tyle da się ustawić na posterunku, guardStand); bez wieży pole nie istnieje
    ...(wieza ? { wieza: wieza.w * wieza.h } : {}),
  };
}

/** uchwały zarządu, które zmieniają symulację (do polecenia 'laws' albo Sim.setLaws) */
export function lawsFrom(l: LawEffects): Partial<Laws> {
  return {
    burnMood: l.burnMood,
    workStart: l.workStart,
    gateClosed: l.gateClosed,
    foodMult: l.foodMult,
    sharedMeals: l.sharedMeals,
  };
}

const clamp100 = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

/** pionek zarządu osoby o id z generatora (s1, s2…) */
function pawnOf(st: SimState, id: string): Pawn | undefined {
  return st.pawns.find((p) => p.kind === 'core' && st.people[p.person]?.id === id);
}

/** Rozstrzygnięcie napadu w tym wywołaniu: jawny wynik zarządu (GovEffects.raidResult) dla napadu, który zarząd
    zaplanował i który jeszcze trwa. Bez niego nic nie zgadujemy: gdy zarząd milczy, szabrownicy po godzinie odchodzą
    bez łupu, a jego straty (fx.stock) znikają ze stanu wprost, raz. */
function raidOutcome(st: SimState, fx: GovEffects): RaidResult | null {
  const r = st.raid;
  const res = fx.raidResult;
  if (!res || !r?.gov || r.outcome || r.phase >= 3) return null;
  return res;
}

/** wolny kafelek podwórka przy bramie na nowy stos (drewno, złom przyniesione z wyprawy) */
function yardSpot(st: SimState, w: World, kind: string, n: number): number {
  const size = w.size;
  const shape = fenceShape(w);
  const gate = gateTiles(w);
  const from = gate.length ? gate[0] : (w.buildings[w.hq]?.entrances[0]?.out ?? 0);
  const fx = from % size;
  const fy = Math.floor(from / size);
  const tiles = (shape?.yard ?? []).filter((i) => !w.blocked[i]);
  // najbliżej bramy, ale nie w przejściu: co najmniej dwa kroki od niej
  tiles.sort(
    (a, b) =>
      Math.hypot((a % size) - fx, Math.floor(a / size) - fy) - Math.hypot((b % size) - fx, Math.floor(b / size) - fy) ||
      a - b,
  );
  for (const i of tiles) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (gate.some((g) => Math.max(Math.abs((g % size) - x), Math.abs(Math.floor(g / size) - y)) < 2)) continue;
    if (onPlan(st, size, i)) continue;
    const here = st.things.filter((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h);
    if (!here.length || (here.length === 1 && here[0].kind === kind && here[0].n + n <= STACK)) return i;
  }
  return nearestFree(w.blocked, size, from);
}

/** zdejmuje n sztuk rzeczy danego rodzaju ze stert na mapie (puste sterty znikają) */
function takeKind(st: SimState, kind: string, n: number): void {
  let left = n;
  for (const t of st.things) {
    if (left <= 0) break;
    if (t.kind !== kind) continue;
    const k = Math.min(t.n, left);
    t.n -= k;
    left -= k;
  }
  st.things = st.things.filter((t) => t.kind !== kind || t.n > 0);
}

/** dokłada n sztuk na stos danego rodzaju na kafelku (nowy albo istniejący) */
function heapAt(st: SimState, w: World, kind: string, i: number, n: number): void {
  const x = i % w.size;
  const y = Math.floor(i / w.size);
  const t = st.things.find((q) => q.kind === kind && q.x === x && q.y === y);
  if (t) t.n += n;
  else st.things.push({ id: st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 });
}

/** przybytek: drewno i złom w stosach przy bramie (zarząd sam zaniesie drewno do składu), zapasy do kuchni */
function give(st: SimState, w: World, k: keyof Loot, n: number): void {
  if (k === 'supplies') {
    const food = st.things.find((t) => t.kind === 'jedzenie');
    if (food) {
      food.n += n;
      return;
    }
    const h = houseOf(w);
    const size = w.size;
    // bez zapasów: przy lodówce zarządu, a bez niej przed drzwiami siedziby
    const fridge = h ? st.things.find((t) => t.kind === 'lodowka' && inHomeApt(h, t.y * size + t.x)) : undefined;
    const at = fridge ? nearestFree(w.blocked, size, fridge.y * size + fridge.x) : yardSpot(st, w, 'jedzenie', n);
    heapAt(st, w, 'jedzenie', at, n);
    return;
  }
  const kind = k === 'wood' ? 'drewno' : 'zlom';
  for (let left = n; left > 0; ) {
    const part = k === 'wood' ? Math.min(STACK, left) : left;
    heapAt(st, w, kind, yardSpot(st, w, kind, part), part);
    left -= part;
  }
}

/** Skutki zarządu w symulacji. Wołać zaraz po govUpdate, signLaw, confirmNight albo chooseEvent z tym samym stanem,
    który poszedł do govInput. Uchwały idą osobno: Sim.setLaws(lawsFrom(lawEffects(gov))). */
export function applyGov(st: SimState, w: World, fx: GovEffects): void {
  const cmd = (c: SimState['cmds'][number]) => st.cmds.push(c);
  // napad: plan na tę noc, a w minucie napadu rozstrzygnięcie (łup wyniosą szabrownicy, nie znika od razu)
  if (fx.raid) planRaid(st, tickOfMinute(fx.raid.at), fx.raid.post, true, fx.raid.people ?? 0, fx.raid.attack ?? 0);
  const res = raidOutcome(st, fx);
  const loot: Loot = { wood: 0, supplies: 0, scrap: 0 };
  if (res && st.raid) {
    st.raid.outcome = res.outcome;
    if (res.outcome === 'wtargnięcie') {
      for (const k of ['wood', 'supplies', 'scrap'] as const) loot[k] = Math.max(0, res.stolen[k] ?? 0);
      st.raid.loot = { ...loot };
    }
  }
  // ludzie: najpierw nowi, żeby skutki dla nich trafiły na miejsce
  for (const p of fx.join) if (!pawnOf(st, p.id)) addCore(st, w, p, true);
  for (const { id, d } of fx.needs) {
    const p = pawnOf(st, id);
    if (!p?.needs) continue;
    for (const [k, v] of Object.entries(d) as [keyof typeof d, number][]) {
      if (k === 'mood')
        p.moods.push({ why: `Sprawy ${wordsOfWorld(w).wspolnota.d}`, d: v, until: st.tick + 12 * TICKS_PER_HOUR });
      else p.needs[k] = clamp100(p.needs[k] + v);
    }
  }
  for (const m of fx.moods) {
    const p = pawnOf(st, m.id);
    if (!p) continue;
    const until = st.tick + Math.round(m.hours * TICKS_PER_HOUR);
    const same = p.moods.find((q) => q.why === m.why);
    if (same) same.until = Math.max(same.until, until);
    else p.moods.push({ why: m.why, d: m.d, until });
  }
  const ids = (list: readonly string[]) => list.map((id) => pawnOf(st, id)?.id ?? -1).filter((id) => id >= 0);
  // wartownicy, którzy według zarządu zasnęli, przysypiają na posterunku
  if (res?.slept.length) dozeOff(st, ids(res.slept));
  if (fx.away.length) cmd({ t: 'away', ids: ids(fx.away.map((a) => a.id)) });
  if (fx.back.length) cmd({ t: 'back', ids: ids(fx.back) });
  for (const g of fx.guards) cmd({ t: 'guard', ids: ids([g.id]), post: g.post });
  // osoba zarządu bije wskazanego pionka (szwendacza z karty); osoby, której nie ma, polecenie nie dotyczy
  for (const a of fx.atak ?? []) {
    const who = ids([a.id]);
    if (who.length) cmd({ t: 'attack', ids: who, target: a.pawn });
  }
  for (const id of fx.leave) removeCore(st, id, w);
  // przyjęci przychodzą zza bramy; nikt nie znika, kto nie ma łóżka, śpi na podłodze
  if (fx.residents > 0) addResidents(st, w, fx.residents, true);
  else if (fx.residents < 0) removeResidents(st, -fx.residents);
  // zapasy (bez łupu napadu, który wyniosą szabrownicy)
  for (const k of ['wood', 'supplies', 'scrap'] as const) {
    const d = fx.stock[k] + loot[k];
    if (d > 0) give(st, w, k, d);
    else if (d < 0) takeStock(st, w, k, -d);
  }
  // części i leki: wydatek najpierw z zapasu zarządu (store), potem z rzeczy na mapie (łup z przeszukania);
  // przybytek leży przy bramie jako rzeczy, żeby budowa i naprawy mogły go użyć
  for (const [k, kind] of [
    ['parts', 'czesci'],
    ['meds', 'leki'],
  ] as const) {
    const d = fx.stock[k];
    for (let left = d; left > 0; left -= STACK) {
      const part = Math.min(STACK, left);
      heapAt(st, w, kind, yardSpot(st, w, kind, part), part);
    }
    if (d >= 0) continue;
    const own = Math.min(st.store[k], -d);
    st.store[k] -= own;
    takeKind(st, kind, -d - own);
  }
  if (fx.patch > 0) cmd({ t: 'mend', ids: [], n: fx.patch });
  if (fx.fire) stairFire(st, w);
  if (fx.sick > 0) sicken(st, fx.sick);
  // znalezione książki na półkę osady; trzecia z dziedziny idzie na podpałkę (drewno przy bramie)
  for (const d of fx.books ?? []) if (dodajKsiazke(st, d) === 'podpalka') give(st, w, 'wood', 1);
  // znaleziska z wypraw do magazynu, ugryzieni na wyprawie zakażeni
  for (const a of fx.arms ?? []) if (a in WEAPONS && a !== 'piesci') (st.store.arms ??= []).push(a as WeaponId);
  for (const [k, n] of Object.entries(fx.ammo ?? {}) as [AmmoKey, number][])
    if (st.store.ammo && k in st.store.ammo) st.store.ammo[k] = Math.max(0, st.store.ammo[k] + n);
  for (const id of fx.bitten ?? []) {
    const p = pawnOf(st, id);
    if (p) infect(st, p, nextRandom(st.rng) < LIMB);
  }
}

/** pożar od kozy (zdarzenie zarządu): spala najbliższy kozie zarządu mebel, który się pali, i straszy wszystkich */
function stairFire(st: SimState, w: World): void {
  const h = houseOf(w);
  const size = w.size;
  const koza = h ? st.things.find((t) => t.kind === 'koza' && inHomeApt(h, t.y * size + t.x)) : undefined;
  if (koza) {
    let best: Thing | undefined;
    let bd = Number.POSITIVE_INFINITY;
    for (const t of st.things) {
      if (!BURNABLE[t.kind]) continue;
      const d = (t.x - koza.x) ** 2 + (t.y - koza.y) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best) {
      const r = h!.room[best.y * size + best.x];
      st.burned.push({ tick: st.tick, kind: best.kind, apt: r >= 0 ? h!.rooms[r].apt : -1, by: -1 });
      st.things.splice(st.things.indexOf(best), 1);
    }
  }
  for (const p of st.pawns)
    if (p.needs && !p.away) {
      p.needs.safe = clamp100(p.needs.safe - 10);
      p.moods.push({ why: 'Pożar od kozy', d: -6, until: st.tick + 24 * TICKS_PER_HOUR });
    }
}

/** chorzy do rozdania (choroby przyjdą w M2): najzdrowsi z zarządu słabną i gorzej się czują przez dobę */
function sicken(st: SimState, n: number): void {
  const list = st.pawns
    .filter((p) => p.kind === 'core' && p.needs && !p.away)
    .sort((a, b) => b.needs!.health - a.needs!.health || a.id - b.id);
  for (const p of list.slice(0, n)) {
    p.needs!.health = clamp100(p.needs!.health - 20);
    p.moods.push({ why: 'Choroba', d: -4, until: st.tick + 24 * TICKS_PER_HOUR });
  }
}
