/* Gracz-bot z zarządem: symulacja i zarząd (src/gov) razem, bez przeglądarki. Zarząd co sekundę przy ekranie
   (tempo 1×: tick / 20), okna zarządu odpowiadane od razu według prostej polityki karty nocy, a w grze tylko
   polecenia, których gra wymaga: samouczek (zaznaczenie i ścięcie suchego drzewa) i kolejne drzewo, kiedy
   opału zostaje mało. Liczy decyzje z czasem przy ekranie i skutki napadów. Używają go testy i tools/bot.ts. */

import { raidersOf } from '../../src/gov/noc.ts';
import type { GovState, NightReport, Prompt } from '../../src/gov/typy.ts';
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
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov, govInput, lawsFrom } from '../../src/sim/gov.ts';
import { dryTreeOf } from '../../src/sim/house.ts';
import { commandFor } from '../../src/sim/orders.ts';
import { type Command, createSim, type Loot, Sim, type SimState, trunkOf } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import type { World } from '../../src/world/world.ts';

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
}

export interface PlayResult {
  decisions: Decision[];
  nights: NightLog[];
  gov: GovState;
  st: SimState;
  hash: string;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** odpowiedź na okno zarządu według polityki (jak answer() w gov-atrapa.ts, ale skutki idą do symulacji) */
function answer(gov: GovState, sim: Sim, w: World, p: Prompt, policy: Policy, screen: number, out: Decision[]): string {
  const st = sim.st;
  const i = govInput(st, w, screen);
  if (p.k === 'raport') {
    ackReport(gov);
    return p.report.lines.join(' ');
  }
  if (p.k === 'uchwala') {
    const ok = p.options.filter((o) => o.s === 'ok');
    let id: string | null = ok[0]?.id ?? null;
    if (policy === 'zawsze-warta') id = ok.find((o) => o.id === 'u_warty')?.id ?? id;
    if (policy === 'nigdy-warty') id = ok.find((o) => o.id === 'u_meble' || o.id === 'u_kociol')?.id ?? id;
    applyGov(st, w, signLaw(gov, i, id));
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
      if (!Object.values(assign).some((k) => k.startsWith('warta:'))) {
        const best = [...card.people].sort((a, b) => b.needs.rest - a.needs.rest)[0];
        if (best && setNight(gov, best.id, `warta:${card.posts[0].key}`))
          out.push({ s: screen, kind: 'przydział', text: `${best.name}: warta ${card.posts[0].key}` });
      }
    }
    const after = { ...gov.night!.assign };
    applyGov(st, w, confirmNight(gov, i));
    return Object.entries(after)
      .map(([id, k]) => `${card.people.find((c) => c.id === id)?.name.split(' ')[0]}: ${k}`)
      .join(', ');
  }
  const k = p.choices.findIndex((c) => c.ok);
  applyGov(st, w, chooseEvent(gov, i, Math.max(0, k)));
  return `${p.title}: ${p.choices[Math.max(0, k)]?.label ?? '?'}`;
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
  const st = createSim(w, seed, { core });
  const sim = new Sim(w, st);
  const gov = newGov(seed);
  const decisions: Decision[] = [];
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
  /** drzewa, do których nie dało się dojść, i drzewo z ostatniego polecenia (−1: brak) */
  const skip = new Set<number>();
  let asked = -1;
  const end = days * TICKS_PER_DAY;
  while (st.tick < end) {
    sim.step();
    if (st.tick % TICKS_PER_SECOND) continue;
    const s = screen();
    const fxu = govUpdate(gov, govInput(st, w, s));
    applyGov(st, w, fxu);
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
    const h = hourOf(st.tick);
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
  return { decisions, nights, gov, st, hash: sim.hash() };
}
