/* Bot trybu zombie: gra z zarządem (src/gov) na Przymorzu przez kilka nocy dwiema politykami karty nocy: warta
   z dzidami przy siatce i bez warty. Na wartę idą najwyżej dwie osoby, i to tylko z dzidą (własną albo z magazynu
   w zamian za swoją broń): najzdrowsze, kto ma mniej niż 45 zdrowia, odpoczywa; ugryzieni (w gorączce) nie stoją.
   Za dnia w obu politykach gracz robi to samo: łata dziury, wzmacnia uszkodzoną siatkę, robi dzidy, czyści
   podwórko ze szwendaczy uzbrojonym zarządem, dźga dzidami przez siatkę tych, którzy stoją pod nią, rąbie drewno
   tylko wtedy, gdy w promieniu 20 m od bramy i od drzewa nie ma szwendaczy (a gdy drewna brak i koza gaśnie,
   rozbiera na opał meble z mieszkania zarządu, łóżka na końcu), dobija zwłoki i amputuje ugryzionych w rękę albo
   nogę. Na noc (od 7:00 do 7:00): stado, najwięcej napierających, zabici, przerwania siatki, ugryzienia za dnia
   (7–20) i w nocy (20–7), zgony, siatka o 6:00, zarząd, jego średnie najedzenie i zdrowie o 7:00, mieszkańcy. Na
   koniec skrót stanu (powtarzalny).
   Trzeci argument to liczba osób zarządu (1–5, domyślnie 4 jak w grze bez ruszania panelu „Wasz zarząd”), żeby
   zobaczyć, jak trudność rośnie przy mniejszym zarządzie.
   Z flagą --mieszkancy (gdziekolwiek wśród argumentów) bot gra na świecie z mieszkańcami siedziby z generatora
   (tools/bot-mieszkancy.ts, jak w grze: zarząd i lokatorzy z osobami z generatora, stany mieszkań siedziby z niego);
   pod nagłówkiem pierwszej polityki jedna linijka o mieszkańcach z adresu. Bez flagi wyjście i skróty bez zmian.
   Z flagą --sasiedzi (M2 fala 2) za dnia jedna osoba z zarządu chodzi do sąsiednich budynków (tests/unit/sasiedzi-play.ts):
   pod tabelą nocy linijka, ile u nich zrobiła, spotkania, rany i ugryzienia; najedzenie w tabeli pokazuje, czy szaber
   ratuje zarząd przed głodem. Bez flagi wyjście i skróty bez zmian.
   Z flagą --demo=NAZWA (przymorze, lanciego, zielonki) bot gra na innym osiedlu niż Przymorze; bez niej wyjście i skróty
   bez zmian.
   Z flagą --opal bot co 10 sekund gry dokłada do kozy, kiedy ognia zostaje na mniej niż dwie godziny, jakby opału
   nie brakowało (w grze brakuje: bez drewna koza gaśnie, warta marznie przy siatce i po dwóch nocach schodzi
   z posterunku, więc od nocy 4–5 siatka zostaje sama). Z tą flagą mierzy się samą siatkę z działającą wartą.
   Uruchomienie: npm run bot:zombie [-- ziarno [noce [osoby]]] [--demo=NAZWA] [--mieszkancy] [--sasiedzi] [--opal] */

import fs from 'node:fs';
import path from 'node:path';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  newGov,
  pending,
  setNight,
  signLaw,
} from '../src/gov/zarzad.ts';
import { dayOf, hourOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { applyGov, govInput } from '../src/sim/gov.ts';
import { houseOf, inHomeApt } from '../src/sim/house.ts';
import { commandsAt } from '../src/sim/orders.ts';
import { AMPUTATE_WINDOW, BURNABLE, createSim, FEVER_TICKS, type Pawn, Sim } from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { hordeSize } from '../src/sim/zombie.ts';
import { buildWorld } from '../src/world/world.ts';
import { type SasiedziLog, sasiedziPlayer } from '../tests/unit/sasiedzi-play.ts';
import {
  ARGUMENTY,
  bezBadan,
  DEMO,
  MIESZKANCY,
  OPAL,
  opisMieszkancow,
  SASIEDZI,
  swiatMieszkancow,
} from './bot-mieszkancy.ts';

bezBadan('bot:zombie');

const SEED = Number(ARGUMENTY[0]) || 1;
const NIGHTS = Number(ARGUMENTY[1]) || 6;
const CORE = Math.max(1, Math.min(5, Math.round(Number(ARGUMENTY[2]) || 4)));

const demoFile = path.resolve(import.meta.dirname, `../public/demo/${DEMO ?? 'przymorze'}.json`);
if (!fs.existsSync(demoFile)) {
  console.error(`Nieznane demo: „${DEMO}”. Dema to pliki public/demo/*.json (przymorze, lanciego, zielonki).`);
  process.exit(2);
}
const demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
// z flagą --mieszkancy świat i opcja `mieszkancy` dla createSim z generatora mieszkańców (tools/bot-mieszkancy.ts)
const osiedle = MIESZKANCY ? await swiatMieszkancow(demo, SEED, CORE) : null;
const world = osiedle ? osiedle.world : buildWorld(demo.geo, { seed: SEED, street: demo.street });
const size = world.size;
const yard = new Set(world.fence.yard);
const fenceDist = (x: number, y: number) =>
  Math.min(...world.fence.tiles.map((t) => Math.hypot((t % size) + 0.5 - x, Math.floor(t / size) + 0.5 - y)));

type Policy = 'warta-dzidy' | 'bez-warty';

/** na wartę staje ten, kto ma co najmniej tyle zdrowia (poniżej 30 sim zdejmuje go z posterunku) */
const GUARD_FIT = 45;

interface Night {
  day: number;
  horde: number;
  pressing: number;
  killed: number;
  breaches: number;
  /** ugryzienia za dnia (7–20) i w nocy (20–7) */
  biteDay: number;
  biteNight: number;
  deaths: number;
  fence: number;
  core: number;
  /** średnie najedzenie i zdrowie zarządu o 7:00 */
  food: number;
  health: number;
  residents: number;
}

function play(policy: Policy): {
  nights: Night[];
  hash: string;
  ms: number;
  over: string;
  start: string;
  sasiedzi: SasiedziLog | null;
} {
  const t0 = performance.now();
  const st = createSim(world, SEED, {
    core: CORE,
    mode: 'zombie',
    ...(osiedle ? { mieszkancy: osiedle.mieszkancy } : {}),
  });
  const start = osiedle ? opisMieszkancow(st) : '';
  const sim = new Sim(world, st);
  const gov = newGov(SEED, 'zombie');
  const nights: Night[] = [];
  const end = NIGHTS * TICKS_PER_DAY + 16 * TICKS_PER_HOUR;
  const core = () => st.pawns.filter((p) => p.kind === 'core' && !p.away);
  const tileOf = (p: Pawn) => Math.floor(p.y) * size + Math.floor(p.x);
  const tally = () => ({ ...st.tally!, deaths: (st.dead ?? []).filter((d) => d.kind !== 'szabrownik').length });
  let mark = tally();
  let peak = 0;
  // ugryzienia od ostatniego liczenia, osobno za dnia i w nocy
  let bitesAt = st.tally!.bites;
  let biteDay = 0;
  let biteNight = 0;
  const door = world.buildings[world.hq].entrances[0]?.out ?? 0;
  const skip = new Set<number>();
  let asked = -1;
  const nb = SASIEDZI ? sasiedziPlayer() : null;
  while (st.tick < end) {
    sim.step();
    const h = hourOf(st.tick);
    if (h >= 21 || h < 6) peak = Math.max(peak, snapshot(st, world).zombies.pressing);
    if (st.tally!.bites !== bitesAt) {
      if (h >= 20 || h < 7) biteNight += st.tally!.bites - bitesAt;
      else biteDay += st.tally!.bites - bitesAt;
      bitesAt = st.tally!.bites;
    }
    if (st.tick % TICKS_PER_SECOND === 0) {
      const s = st.tick / TICKS_PER_SECOND;
      applyGov(st, world, govUpdate(gov, govInput(st, world, s)));
      if (gov.over) break;
      for (let k = 0; k < 5; k++) {
        const i = govInput(st, world, s);
        const p = pending(gov, i);
        if (!p) break;
        if (p.k === 'raport') ackReport(gov, i);
        else if (p.k === 'uchwala') applyGov(st, world, signLaw(gov, i, null));
        else if (p.k === 'wydarzenie')
          applyGov(
            st,
            world,
            chooseEvent(
              gov,
              i,
              p.choices.findIndex((c) => c.ok),
            ),
          );
        else {
          // propozycja zarządu zostaje (wyprawy po zapasy), zmienia się tylko warta przy siatce
          for (const [id, key] of Object.entries(p.assign)) if (key.startsWith('warta:')) setNight(gov, id, 'sen');
          if (policy === 'warta-dzidy') {
            // warta tylko z dzidą, najwyżej dwie osoby, najzdrowsze (z własną dzidą albo z magazynu, w zamian za
            // swoją broń); bez ugryzionych. Kto ma mniej niż GUARD_FIT zdrowia, odpoczywa, a gdyby brakowało
            // zdrowych, staje najzdrowszy z resztą sił (poniżej 30 zdrowia i tak zszedłby z posterunku).
            let spare = (st.store.arms ?? []).filter((a) => a === 'dzida').length;
            let guards = 0;
            const order = core()
              .filter((q) => q.bite === undefined)
              .sort(
                (a, b) =>
                  b.needs!.health - a.needs!.health ||
                  Number(b.weapon === 'dzida') - Number(a.weapon === 'dzida') ||
                  a.id - b.id,
              );
            for (const min of [GUARD_FIT, 30]) {
              for (const q of order) {
                if (guards >= 2) break;
                if ((q.needs?.health ?? 0) < min) continue;
                const spear = q.weapon === 'dzida';
                if (!spear && spare <= 0) continue;
                const id = st.people[q.person].id;
                if (gov.night?.assign[id] === 'warta:siatka' || !setNight(gov, id, 'warta:siatka')) continue;
                if (!spear) {
                  sim.push({ t: 'arm', ids: [q.id], weapon: 'dzida' });
                  spare--;
                }
                guards++;
              }
            }
          }
          applyGov(st, world, confirmNight(gov, i));
        }
      }
    }
    // gracz co 10 sekund gry
    if (st.tick % (10 * TICKS_PER_SECOND) === 0) {
      // --opal: opał do kozy z niczego (dwie godziny ognia to 1600 kroków, dokłada do czterech godzin)
      const koza = OPAL ? st.things.find((t) => t.kind === 'koza') : undefined;
      if (koza && koza.fuel < 2 * TICKS_PER_HOUR) koza.fuel = 4 * TICKS_PER_HOUR;
      // fala 2 (--sasiedzi): jedna osoba u sąsiadów za dnia
      nb?.player(sim, world, st.tick / TICKS_PER_SECOND, (c) => sim.push(c));
      const people = core();
      const armed = people.filter((p) => p.weapon && p.job?.t !== 'guard' && (p.needs?.health ?? 0) > 40);
      // podwórko: uzbrojeni na szwendaczy, którzy weszli
      const inYard = st.pawns.filter((p) => p.kind === 'zombie' && yard.has(tileOf(p)));
      for (const q of armed) {
        if (!inYard.length || q.job?.t === 'fight') continue;
        const z = inYard.sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
        sim.push({ t: 'attack', ids: [q.id], target: z.id });
      }
      // za dnia sprzątanie przy siatce: kto ma dzidę, dźga przez siatkę szwendaczy, którzy stoją pod nią
      if (h >= 6 && h < 20) {
        const atFence = st.pawns.filter((p) => p.kind === 'zombie' && !yard.has(tileOf(p)) && fenceDist(p.x, p.y) <= 2);
        for (const q of people) {
          if (q.weapon !== 'dzida' || !atFence.length || (q.needs?.health ?? 0) <= 50) continue;
          if (['fight', 'guard', 'amputate', 'sleep'].includes(q.job?.t ?? '')) continue;
          const z = atFence.sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
          const m = commandsAt(st, world, [q.id], tileOf(z)).find((c) => c.cmd.t === 'attack');
          if (m) sim.push(m.cmd);
        }
      }
      // ugryziony w rękę albo nogę: amputacja przez najlepszego medyka
      for (const q of people)
        if (
          q.bite !== undefined &&
          q.limb &&
          st.tick <= q.bite + AMPUTATE_WINDOW &&
          !people.some((x) => x.job?.t === 'amputate')
        ) {
          const doc = people
            .filter((x) => x !== q)
            .sort((a, b) => (st.people[b.person].skills.med ?? 0) - (st.people[a.person].skills.med ?? 0))[0];
          if (doc) sim.push({ t: 'amputate', ids: [doc.id], patient: q.id });
        }
      // umierający w gorączce: ktoś z bronią czeka obok, żeby dobić, zanim zmarły wstanie
      for (const q of people)
        if (q.bite !== undefined && q.bite + FEVER_TICKS - st.tick < 2 * TICKS_PER_HOUR) {
          const watching = people.some(
            (x) => x !== q && x.job?.t === 'go' && x.job.order && Math.hypot(x.x - q.x, x.y - q.y) < 3,
          );
          const helper = people
            .filter((x) => x !== q && x.weapon && x.bite === undefined && x.job?.t !== 'guard' && x.job?.t !== 'fight')
            .sort((a, b) => b.needs!.health - a.needs!.health || a.id - b.id)[0];
          if (!watching && helper) sim.push({ t: 'move', ids: [helper.id], to: tileOf(q) });
        }
      // za dnia: łatanie, wzmacnianie, dzidy, dobijanie
      if (h >= 7 && h < 19 && !inYard.length) {
        const free = people.filter((p) => !p.job || p.job.t === 'go' || p.job.t === 'stay');
        const busy = (t: string) => people.some((p) => p.job?.t === t);
        const hole = st.fence!.holes.find((x) => !x.patch);
        const items = (tile: number, t: string) =>
          commandsAt(st, world, [free[0]?.id ?? -1], tile).find((m) => m.cmd.t === t);
        if (free.length && hole && !busy('patch')) {
          const m = items(hole.tiles[0], 'patch');
          if (m) sim.push(m.cmd);
        } else if (free.length && !busy('brace')) {
          const k = st.fence!.hp.reduce((b, v, j) => (v > 0 && v < st.fence!.hp[b] ? j : b), 0);
          const m = st.fence!.hp[k] < 70 ? items(world.fence.tiles[k], 'brace') : undefined;
          if (m) sim.push(m.cmd);
        }
        // opał: drzewo najbliżej drzwi siedziby, kiedy drewna mało (drzewo, do którego nikt nie doszedł, odpada)
        const sn = snapshot(st, world).stock;
        const chopping = busy('chop');
        if (asked >= 0 && !chopping && !st.felled.includes(asked)) skip.add(asked);
        asked = -1;
        // drwal: najzdrowszy, który nie stoi na warcie, nie śpi i nie amputuje
        const woodman = people
          .filter((p) => !['guard', 'sleep', 'amputate', 'fight', 'leave'].includes(p.job?.t ?? ''))
          .sort((a, b) => b.needs!.health - a.needs!.health || a.id - b.id)[0];
        // drwal wychodzi za siatkę tylko wtedy, gdy przy bramie nie stoją szwendacze
        const gateClear = !st.pawns.some(
          (p) =>
            p.kind === 'zombie' &&
            Math.hypot(p.x - ((sim.exitTile % size) + 0.5), p.y - (Math.floor(sim.exitTile / size) + 0.5)) < 20,
        );
        if (sn.wood < 8 && !chopping && woodman && gateClear) {
          let best = -1;
          let bd = Number.POSITIVE_INFINITY;
          world.trees.forEach((t, k) => {
            if (t.kind === 2 || st.felled.includes(k) || skip.has(k)) return;
            if (st.pawns.some((p) => p.kind === 'zombie' && Math.hypot(p.x - t.x, p.y - t.y) < 20)) return;
            const d = Math.hypot(t.x - (door % size), t.y - Math.floor(door / size));
            if (d < bd) {
              bd = d;
              best = k;
            }
          });
          if (best >= 0) {
            sim.push({ t: 'chop', ids: [woodman.id], tree: best });
            asked = best;
          }
        }
        // koza gaśnie, a drewna nie ma (drzewa stoją w tłumie szwendaczy): ktoś rozbiera mebel z mieszkania zarządu
        // na opał, najpierw to, bez czego da się żyć, łóżka na końcu
        const stove = st.things.find((t) => t.kind === 'koza');
        const home = houseOf(world);
        if (home && stove && stove.fuel < 2 * TICKS_PER_HOUR && sn.wood < 1 && free.length && !busy('burn')) {
          const piece = ['mebloscianka', 'stol', 'wersalka', 'krzeslo', 'lozko']
            .flatMap((k) => st.things.filter((t) => t.kind === k && BURNABLE[k] && inHomeApt(home, t.y * size + t.x)))
            .at(0);
          const m =
            piece && commandsAt(st, world, [free[0].id], piece.y * size + piece.x).find((c) => c.cmd.t === 'burn');
          if (m) sim.push(m.cmd);
        }
        const body = st.things.find((t) => t.kind === 'zwloki' && t.fuel > 0);
        if (free.length > 1 && body) sim.push({ t: 'finish', ids: [free[1].id], thing: body.id });
        const heap = st.things.find((t) => t.kind === 'deski');
        if (
          free.length > 2 &&
          heap &&
          !busy('craft') &&
          (st.store.arms ?? []).filter((a) => a === 'dzida').length < 1
        ) {
          const m = items(heap.y * size + heap.x, 'craft');
          if (m) sim.push({ ...m.cmd, ids: [free[2].id] });
        }
      }
    }
    // rano o 7:00: noc się liczy
    if (st.tick % TICKS_PER_DAY === 16 * TICKS_PER_HOUR) {
      const now = tally();
      const snap = snapshot(st, world);
      const avg = (k: 'food' | 'health') =>
        snap.people.length ? snap.people.reduce((a, p) => a + p.needs[k], 0) / snap.people.length : 0;
      nights.push({
        day: dayOf(st.tick) - 1,
        horde: hordeSize(dayOf(st.tick) - 1),
        pressing: peak,
        killed: now.killed - mark.killed,
        breaches: now.breaches - mark.breaches,
        biteDay,
        biteNight,
        deaths: now.deaths - mark.deaths,
        fence: snap.fence.durability,
        core: snap.people.length,
        food: avg('food'),
        health: avg('health'),
        residents: snap.residents,
      });
      mark = now;
      peak = 0;
      biteDay = 0;
      biteNight = 0;
    }
  }
  const end_ = gov.over ? `koniec gry: ${gov.over}, dzień ${dayOf(st.tick)}` : 'gra trwa';
  return {
    nights,
    hash: sim.hash(),
    ms: performance.now() - t0,
    start,
    over: `${end_}, zaufanie ${Math.round(gov.trust)}, wkurzenie ${Math.round(gov.anger)}`,
    sasiedzi: nb?.log ?? null,
  };
}

console.log(
  `Bot trybu zombie, ${demo.name}, ziarno ${SEED}, noce ${NIGHTS}, zarząd ${CORE}${OPAL ? ', z opałem do kozy z niczego' : ''}`,
);
for (const policy of ['warta-dzidy', 'bez-warty'] as const) {
  const r = play(policy);
  console.log(`\n  ${policy} (${(r.ms / 1000).toFixed(1)} s, skrót ${r.hash}; ${r.over})`);
  if (r.start && policy === 'warta-dzidy') console.log(`  ${r.start}`);
  console.log(
    '  noc  stado  napiera  zabici  przerwania  ugryzienia dzień/noc  zgony  siatka  zarząd  najedzenie  zdrowie  mieszkańcy',
  );
  for (const n of r.nights)
    console.log(
      `  ${String(n.day).padStart(3)}  ${String(n.horde).padStart(5)}  ${String(n.pressing).padStart(7)}  ${String(n.killed).padStart(6)}  ${String(n.breaches).padStart(10)}  ${`${n.biteDay}/${n.biteNight}`.padStart(20)}  ${String(n.deaths).padStart(5)}  ${n.fence.toFixed(2).padStart(6)}  ${String(n.core).padStart(6)}  ${String(Math.round(n.food)).padStart(10)}  ${String(Math.round(n.health)).padStart(7)}  ${String(n.residents).padStart(10)}`,
    );
  const nb = r.sasiedzi;
  if (nb)
    console.log(
      `  u sąsiadów: otwarte budynki ${nb.opened}, przeszukane pomieszczenia ${nb.rooms}, piętra ${nb.floors}, spotkania ${nb.meetings}, rany ${nb.wounds}, ugryzienia na piętrach ${nb.bites}`,
    );
}
