/* Gracz-bot z zarządem: symulacja i zarząd (src/gov) razem, bez przeglądarki. Zarząd co sekundę przy ekranie
   (tempo 1×: tick / 20), okna zarządu odpowiadane od razu według prostej polityki karty nocy, a w grze tylko
   polecenia, których gra wymaga: samouczek (zaznaczenie i ścięcie suchego drzewa) i kolejne drzewo, kiedy
   opału zostaje mało. Liczy decyzje z czasem przy ekranie i skutki napadów. Używają go testy i tools/bot.ts. */

import { raidersOf } from '../../src/gov/noc.ts';
import type { GovEffects, GovState, NightReport, Prompt } from '../../src/gov/typy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  setNight,
  signLaw,
} from '../../src/gov/zarzad.ts';
import { dayOf, hourOf, minutesAt, TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput, lawsFrom } from '../../src/sim/gov.ts';
import { dryTreeOf } from '../../src/sim/house.ts';
import { HUNGRY } from '../../src/sim/needs.ts';
import { commandFor } from '../../src/sim/orders.ts';
import {
  type Command,
  createSim,
  type Laws,
  type Loot,
  Sim,
  type SimOpts,
  type SimState,
  trunkOf,
} from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { World } from '../../src/world/world.ts';
import type { Player } from './m2-play.ts';

export type Policy = 'zawsze-warta' | 'nigdy-warty';

export interface Decision {
  /** sekundy przy ekranie (1×) */
  s: number;
  /** okno zarządu ('raport', 'uchwala', 'karta', 'wydarzenie'), zmiana na karcie ('przydział') albo polecenie w grze */
  kind: string;
  text: string;
}

export interface NightLog {
  day: number;
  /** ile osób na warcie (z karty) */
  guards: number;
  /** plan napadu z zarządu: posterunek, rozstrzygnięcie w symulacji, wyniesione przez szabrowników */
  raid: { post: string; outcome: string; took: Loot; n: number } | null;
  /** raport zarządu rano */
  report: NightReport['raid'] | null;
  stolen: Loot;
  /** średnie bezpieczeństwo rano o 7:00: zarząd i mieszkańcy */
  safeCore: number;
  safeRes: number;
  /** ktoś czuwał przy kozie (dyżur z menu kozy, w karcie przyszły klucz 'warta:koza') */
  koza: boolean;
  /** temperatura w kuchni zarządu o 6:00 rano (°C) i część nocy 22–6, w której koza się paliła */
  kitchen6: number | null;
  fire: number;
  /** jawny wynik zarządu (raidResult): ilu szabrowników wynika z siły, ilu wartowników zasnęło według zarządu
      i ilu z nich przysypia w symulacji */
  result: { people: number; slept: number; dozing: number } | null;
}

export interface PlayOpts {
  /** dyżur przy kozie każdej nocy: najbardziej wypoczęty z tych, którzy śpią */
  koza?: boolean;
  /** od 16:00 bot ścina drzewa, dopóki zapasu drewna (bez kozy) nie ma tyle; rano i w południe zawsze 6 */
  evening?: number;
  /** gracz z dodatkowymi poleceniami (np. prace fali 1 M2), co sekundę przy ekranie; jego polecenia to decyzje
      rodzaju 'praca' */
  player?: Player;
  /** zarząd i mieszkańcy siedziby z generatora mieszkańców (opcja `mieszkancy` createSim; flaga --mieszkancy botów);
      bez niej sim powstaje jak przed krokiem 5 */
  mieszkancy?: SimOpts['mieszkancy'];
}

/** poranek wartownika po nocy na posterunku (6:00–14:00): najedzenie i siły o 6:00, godzina pierwszego posiłku
    (−1: nie jadł), najniższe najedzenie, czy po posiłku spał */
export interface GuardMorning {
  day: number;
  food6: number;
  rest6: number;
  ateAt: number;
  minFood: number;
  napped: boolean;
  /** spał w ogóle między 6:00 a 14:00 */
  slept: boolean;
  /** jedzenie zarządu o 6:00 (zapasy i garnek) i ilu w zarządzie było wtedy głodnych */
  stock6: number;
  hungry6: number;
}

/** głód zarządu w całej grze: poranki od dnia 2 (o 6:00) i te, w których jedzenia (zapasy i garnek) było mniej niż
    głodnych w zarządzie; próbki co 10 s przy ekranie i te, w których ktoś z zarządu miał najedzenie poniżej 10 */
export interface Hunger {
  mornings: number;
  short: number;
  samples: number;
  starving: number;
}

export interface PlayResult {
  decisions: Decision[];
  mornings: GuardMorning[];
  hunger: Hunger;
  /** przyjęcia: ilu ludzi przyjął zarząd (fx.residents) i ilu pionków mieszkańców od tego przybyło */
  admitted: { asked: number; added: number };
  nights: NightLog[];
  gov: GovState;
  st: SimState;
  hash: string;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** gracz wystawia na wartę tylko zdrowych (z mniejszym zdrowiem wartownik schodzi w nocy z posterunku) */
const GUARD_HEALTH = 40;

/** przyjęcia liczone przy każdym applyGov: zarząd przyjął, przybyło pionków */
const tally = { asked: 0, added: 0 };
function apply(st: SimState, w: World, fx: GovEffects): void {
  const before = st.pawns.filter((p) => p.kind === 'resident').length;
  applyGov(st, w, fx);
  if (fx.residents <= 0) return;
  tally.asked += fx.residents;
  tally.added += st.pawns.filter((p) => p.kind === 'resident').length - before;
}

/** odpowiedź na okno zarządu według polityki (jak answer() w gov-atrapa.ts, ale skutki idą do symulacji) */
function answer(gov: GovState, sim: Sim, w: World, p: Prompt, policy: Policy, screen: number, out: Decision[]): string {
  const st = sim.st;
  const i = govInput(st, w, screen);
  if (p.k === 'raport') {
    ackReport(gov);
    return p.report.lines.map((l) => l.pl).join(' ');
  }
  if (p.k === 'uchwala') {
    const ok = p.options.filter((o) => o.s === 'ok');
    let id: string | null = ok[0]?.id ?? null;
    if (policy === 'zawsze-warta') id = ok.find((o) => o.id === 'u_warty')?.id ?? id;
    if (policy === 'nigdy-warty') id = ok.find((o) => o.id === 'u_meble' || o.id === 'u_kociol')?.id ?? id;
    apply(st, w, signLaw(gov, i, id));
    sim.setLaws(lawsFrom(lawEffects(gov)));
    return id ? `uchwała ${id}` : 'bez uchwały';
  }
  if (p.k === 'karta') {
    const card = p.card;
    for (const cp of card.people) {
      const cur = p.assign[cp.id] ?? 'sen';
      if (policy === 'nigdy-warty' && cur.startsWith('warta:') && setNight(gov, cp.id, 'sen'))
        out.push({ s: screen, kind: 'przydział', text: `${cp.name}: sen zamiast warty` });
    }
    if (policy === 'zawsze-warta') {
      const assign = gov.night!.assign;
      // chorego (zdrowie poniżej 40) gracz na wartę nie wystawia: w symulacji zszedłby z posterunku w nocy
      for (const cp of card.people)
        if ((assign[cp.id] ?? '').startsWith('warta:') && cp.needs.health < GUARD_HEALTH && setNight(gov, cp.id, 'sen'))
          out.push({ s: screen, kind: 'przydział', text: `${cp.name}: sen zamiast warty (zdrowie)` });
      if (!Object.values(assign).some((k) => k.startsWith('warta:'))) {
        const best = [...card.people]
          .filter((c) => c.needs.health >= GUARD_HEALTH)
          .sort((a, b) => b.needs.rest - a.needs.rest)[0];
        if (best && setNight(gov, best.id, `warta:${card.posts[0].key}`))
          out.push({ s: screen, kind: 'przydział', text: `${best.name}: warta ${card.posts[0].key}` });
      }
    }
    const after = { ...gov.night!.assign };
    apply(st, w, confirmNight(gov, i));
    return Object.entries(after)
      .map(([id, k]) => `${card.people.find((c) => c.id === id)?.name.split(' ')[0]}: ${k}`)
      .join(', ');
  }
  const k = p.choices.findIndex((c) => c.ok);
  apply(st, w, chooseEvent(gov, i, Math.max(0, k)));
  return `${p.title.pl}: ${p.choices[Math.max(0, k)]?.label.pl ?? '?'}`;
}

/** najbliższe drzwi siedziby drzewo do ścięcia (nie krzak, nieścięte, nie z listy tych, do których się nie dało dojść) */
function nextTree(sim: Sim, w: World, skip: ReadonlySet<number>): number {
  const st = sim.st;
  const door = w.buildings[w.hq].entrances[0]?.out ?? 0;
  const dx = door % w.size;
  const dy = Math.floor(door / w.size);
  let best = -1;
  let bd = Number.POSITIVE_INFINITY;
  w.trees.forEach((t, k) => {
    if (t.kind === 2 || st.felled.includes(k) || skip.has(k)) return;
    const d = Math.hypot(t.x - dx, t.y - dy);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
}

/** cała gra z zarządem przez `days` dni od 15:00 pierwszego dnia */
export function playWithGov(
  w: World,
  seed: number,
  policy: Policy,
  days: number,
  core = 4,
  opts: PlayOpts = {},
): PlayResult {
  const st = createSim(w, seed, { core, ...(opts.mieszkancy ? { mieszkancy: opts.mieszkancy } : {}) });
  const sim = new Sim(w, st);
  const gov = newGov(seed);
  const decisions: Decision[] = [];
  tally.asked = 0;
  tally.added = 0;
  const nights: NightLog[] = [];
  const screen = () => st.tick / TICKS_PER_SECOND;
  const order = (c: Command, text: string) => {
    sim.push(c);
    decisions.push({ s: screen(), kind: 'polecenie', text });
  };
  // samouczek: zaznaczyć kogoś z zarządu i kliknąć suche drzewo
  const cores = () => st.pawns.filter((p) => p.kind === 'core' && !p.away);
  const dry = dryTreeOf(w);
  if (dry >= 0) {
    const who = cores()[0];
    order({ t: 'select', ids: [who.id] }, 'zaznaczenie');
    const c = commandFor(st, w, [who.id], trunkOf(w, w.trees[dry]));
    if (c) order(c, 'ścinaj suche drzewo');
  }
  let night: NightLog | null = null;
  let fireN = 0;
  const mornings: GuardMorning[] = [];
  const hunger: Hunger = { mornings: 0, short: 0, samples: 0, starving: 0 };
  /** wartownicy, których poranek liczymy: pionek, posiłek sprzed 6:00, wpis */
  let watch: { p: (typeof st.pawns)[number]; meal0: number; m: GuardMorning }[] = [];
  /** drzewa, do których nie dało się dojść, i drzewo z ostatniego polecenia (−1: brak) */
  const skip = new Set<number>();
  let asked = -1;
  const end = days * TICKS_PER_DAY;
  while (st.tick < end) {
    sim.step();
    if (st.tick % TICKS_PER_SECOND) continue;
    const s = screen();
    const fxu = govUpdate(gov, govInput(st, w, s));
    apply(st, w, fxu);
    // jawny wynik napadu: zgadza się z planem (ilu ich jest) i ze snem warty na ekranie?
    const res = fxu.raidResult;
    if (res && night) {
      const slept = st.pawns.filter((q) => q.kind === 'core' && res.slept.includes(st.people[q.person].id));
      night.result = {
        people: raidersOf(res.attack),
        slept: res.slept.length,
        dozing: slept.filter((q) => q.job?.t === 'guard' && q.job.phase === 4).length,
      };
    }
    for (let k = 0; k < 5; k++) {
      const p = pending(gov, govInput(st, w, s));
      if (!p) break;
      const text = answer(gov, sim, w, p, policy, s, decisions);
      decisions.push({ s, kind: p.k, text });
      if (p.k === 'karta') {
        const assign = gov.night?.assign ?? {};
        night = {
          day: p.card.day,
          guards: Object.values(assign).filter((x) => x.startsWith('warta:')).length,
          raid: null,
          report: null,
          stolen: { wood: 0, supplies: 0, scrap: 0 },
          safeCore: 0,
          safeRes: 0,
          koza: false,
          kitchen6: null,
          fire: 0,
          result: null,
        };
        // dyżur przy kozie: dopóki karta nie ma 'warta:koza', gracz daje go z menu kozy
        if (opts.koza) {
          const sleepers = cores().filter((q) => (assign[st.people[q.person].id] ?? 'sen') === 'sen');
          const best = sleepers.sort((a, b) => b.needs!.rest - a.needs!.rest || a.id - b.id)[0];
          if (best) {
            sim.push({ t: 'guard', ids: [best.id], post: 'koza' });
            decisions.push({ s, kind: 'przydział', text: `${st.people[best.person].name}: dyżur przy kozie` });
            night.koza = true;
          }
        }
      }
      if (p.k === 'raport' && night) {
        night.report = p.report.raid;
        night.stolen = { wood: p.report.stolen.wood, supplies: p.report.stolen.supplies, scrap: p.report.stolen.scrap };
      }
    }
    opts.player?.(sim, w, s, (c, text) => {
      sim.push(c);
      decisions.push({ s, kind: 'praca', text });
    });
    const h = hourOf(st.tick);
    // głód zarządu: o 6:00 od dnia 2 starczy jedzenia dla głodnych? co 10 s kto z zarządu głoduje
    if (
      h === 6 &&
      dayOf(st.tick) >= 2 &&
      Math.floor(minutesAt(st.tick)) % 60 === 0 &&
      st.tick % (TICKS_PER_SECOND * 60) < TICKS_PER_SECOND
    ) {
      const sn = snapshot(st, w).stock;
      hunger.mornings++;
      if (sn.supplies + sn.meals < cores().filter((q) => q.needs!.food < HUNGRY).length) hunger.short++;
    }
    if (st.tick % (TICKS_PER_SECOND * 10) === 0)
      for (const q of cores()) {
        hunger.samples++;
        if (q.needs!.food < 10) hunger.starving++;
      }
    // poranek wartowników: kto o 5:00 stoi na posterunku, tego od 6:00 do 14:00
    if (h === 5 && !watch.length)
      watch = st.pawns
        .filter((q) => q.kind === 'core' && !q.away && q.job?.t === 'guard')
        .map((q) => ({
          p: q,
          meal0: q.lastMeal,
          m: {
            day: dayOf(st.tick),
            food6: -1,
            rest6: -1,
            ateAt: -1,
            minFood: 100,
            napped: false,
            slept: false,
            stock6: -1,
            hungry6: 0,
          },
        }));
    if (watch.length && h >= 6 && h < 14)
      for (const g of watch) {
        if (g.m.food6 < 0) {
          const sn = snapshot(st, w).stock;
          g.m.food6 = g.p.needs!.food;
          g.m.rest6 = g.p.needs!.rest;
          g.m.stock6 = sn.supplies + sn.meals;
          g.m.hungry6 = cores().filter((q) => q.needs!.food < HUNGRY).length;
        }
        g.m.minFood = Math.min(g.m.minFood, g.p.needs!.food);
        if (g.m.ateAt < 0 && g.p.lastMeal !== g.meal0) g.m.ateAt = h + (Math.floor(minutesAt(st.tick)) % 60) / 60;
        const asleep = g.p.job?.t === 'sleep' && g.p.job.phase === 1;
        if (asleep) g.m.slept = true;
        if (g.m.ateAt >= 0 && asleep) g.m.napped = true;
      }
    if (watch.length && h === 14) {
      mornings.push(...watch.map((g) => g.m));
      watch = [];
    }
    // noc 22–6: jak długo pali się koza zarządu; o 6:00 temperatura w kuchni
    if (night && (h >= 22 || h < 6)) {
      night.fire += snapshot(st, w).kozaLit ? 1 : 0;
      fireN++;
    }
    if (night && h === 6 && night.kitchen6 === null && dayOf(st.tick) === night.day + 1) {
      night.kitchen6 = snapshot(st, w).kitchen;
      night.fire = fireN ? night.fire / fireN : 0;
      fireN = 0;
    }
    // rano o 7:00 noc się liczy: napad w symulacji i bezpieczeństwo
    if (night && h === 7 && dayOf(st.tick) === night.day + 1 && st.tick % (TICKS_PER_SECOND * 60) === 0) {
      const r = st.raid;
      if (r?.gov && r.at > (night.day - 1) * TICKS_PER_DAY)
        night.raid = { post: r.post, outcome: r.outcome, took: { ...r.took }, n: r.n };
      const snap = snapshot(st, w);
      night.safeCore = avg(snap.people.filter((p) => !p.away).map((p) => p.needs.safe));
      night.safeRes = avg(st.pawns.filter((p) => p.kind === 'resident').map((p) => p.needs!.safe));
      nights.push(night);
      night = null;
    }
    // polecenia, których wymaga gra: za dnia, gdy opału zostaje mało, następne drzewo
    if (st.tick % (TICKS_PER_SECOND * 10) === 0 && h >= 7 && h < 21) {
      const sn = snapshot(st, w).stock;
      const wood = h >= 16 && opts.evening ? sn.woodSklad + sn.woodLoose + sn.woodCarried : sn.wood;
      const want = h >= 16 && opts.evening ? opts.evening : 6;
      const chopping = st.pawns.some((p) => p.job?.t === 'chop');
      // drzewo z poprzedniego polecenia, którego nikt nie zaczął ścinać, jest nieosiągalne: następnym razem inne
      if (asked >= 0 && !chopping && !st.felled.includes(asked)) skip.add(asked);
      asked = -1;
      if (wood < want && !chopping) {
        const k = nextTree(sim, w, skip);
        const who = cores().find((p) => p.job?.t !== 'sleep' && p.job?.t !== 'guard') ?? cores()[0];
        if (k >= 0 && who) {
          order({ t: 'chop', ids: [who.id], tree: k }, 'ścinaj drzewo na opał');
          asked = k;
        }
      }
    }
  }
  return { decisions, mornings, hunger, admitted: { ...tally }, nights, gov, st, hash: sim.hash() };
}

export interface LawsRun {
  /** zapasy jedzenia (surowe i w garnku) po dniach, na koniec */
  supplies: number;
  /** średnie najedzenie i nastrój zarządu przez cały przebieg, nastrój mieszkańców */
  food: number;
  mood: number;
  resMood: number;
  /** ile razy gotowano, ile posiłków zjedzono, czy zapasy skończyły się przed końcem (dzień albo null) */
  cooks: number;
  meals: number;
  emptyDay: number | null;
}

/** Gra bez zarządu z uchwałami o jedzeniu od startu: samouczek i drzewo na opał, kiedy drewna mało (jak w playWithGov),
    przez `days` dni od 15:00. Do porównania racji, kotła i wspólnych posiłków. */
export function playLaws(
  w: World,
  seed: number,
  laws: Partial<Laws>,
  days: number,
  mieszkancy?: SimOpts['mieszkancy'],
): LawsRun {
  const st = createSim(w, seed, { core: 4, ...(mieszkancy ? { mieszkancy } : {}) });
  const sim = new Sim(w, st);
  sim.setLaws(laws);
  const cores = () => st.pawns.filter((p) => p.kind === 'core' && !p.away);
  const dry = dryTreeOf(w);
  if (dry >= 0) {
    const who = cores()[0];
    sim.push({ t: 'select', ids: [who.id] });
    const c = commandFor(st, w, [who.id], trunkOf(w, w.trees[dry]));
    if (c) sim.push(c);
  }
  const skip = new Set<number>();
  let asked = -1;
  let cooks = 0;
  let wasCooking = false;
  let meals = 0;
  let food = 0;
  let mood = 0;
  let resMood = 0;
  let n = 0;
  let rn = 0;
  let emptyDay: number | null = null;
  const end = days * TICKS_PER_DAY;
  while (st.tick < end) {
    const last = cores().map((p) => p.lastMeal);
    sim.step();
    cores().forEach((p, k) => {
      if (p.lastMeal !== last[k]) meals++;
    });
    const cooking = cores().some((p) => p.job?.t === 'cook' && p.job.phase === 1);
    if (cooking && !wasCooking) cooks++;
    wasCooking = cooking;
    if (st.tick % TICKS_PER_SECOND) continue;
    if (st.tick % (TICKS_PER_SECOND * 10) === 0) {
      for (const p of cores()) {
        food += p.needs!.food;
        mood += p.needs!.mood;
        n++;
      }
      for (const p of st.pawns)
        if (p.kind === 'resident') {
          resMood += p.needs!.mood;
          rn++;
        }
      const s = snapshot(st, w).stock;
      if (emptyDay === null && s.supplies + s.meals === 0) emptyDay = dayOf(st.tick);
      // drewno na opał za dnia, jak w playWithGov
      const h = hourOf(st.tick);
      if (h >= 7 && h < 21) {
        const chopping = st.pawns.some((p) => p.job?.t === 'chop');
        if (asked >= 0 && !chopping && !st.felled.includes(asked)) skip.add(asked);
        asked = -1;
        if (s.wood < 6 && !chopping) {
          const k = nextTree(sim, w, skip);
          const who = cores().find((p) => p.job?.t !== 'sleep') ?? cores()[0];
          if (k >= 0 && who) {
            sim.push({ t: 'chop', ids: [who.id], tree: k });
            asked = k;
          }
        }
      }
    }
  }
  const s = snapshot(st, w).stock;
  return {
    supplies: s.supplies + s.meals,
    food: food / Math.max(1, n),
    mood: mood / Math.max(1, n),
    resMood: resMood / Math.max(1, rn),
    cooks,
    meals,
    emptyDay,
  };
}
