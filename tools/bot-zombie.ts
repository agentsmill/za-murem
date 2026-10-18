/* Bot trybu zombie: gra z zarządem (src/gov) na Przymorzu przez kilka nocy dwiema politykami karty nocy: warta
   z dzidami przy siatce (dwie najzdrowsze osoby, dzidy z magazynu) i bez warty. Za dnia w obu politykach gracz
   robi to samo: łata dziury, wzmacnia uszkodzoną siatkę, robi dzidy, czyści podwórko ze szwendaczy uzbrojonym
   zarządem, dobija zwłoki i amputuje ugryzionych w rękę albo nogę. Na noc: stado, najwięcej napierających,
   zabici, przerwania siatki, ugryzienia, zgony, siatka o 6:00, kto żyje. Na koniec skrót stanu (powtarzalny).
   Trzeci argument to liczba osób zarządu (1–5, domyślnie 4 jak w grze bez ruszania panelu „Wasz zarząd”), żeby
   zobaczyć, jak trudność rośnie przy mniejszym zarządzie.
   Z flagą --mieszkancy (gdziekolwiek wśród argumentów) bot gra na świecie z mieszkańcami siedziby z generatora
   (tools/bot-mieszkancy.ts, jak w grze: zarząd i lokatorzy z osobami z generatora, stany mieszkań siedziby z niego);
   pod nagłówkiem pierwszej polityki jedna linijka o mieszkańcach z adresu. Bez flagi wyjście i skróty bez zmian.
   Uruchomienie: npm run bot:zombie [-- ziarno [noce [osoby]]] [--mieszkancy] */

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
import { commandsAt } from '../src/sim/orders.ts';
import { AMPUTATE_WINDOW, createSim, FEVER_TICKS, type Pawn, Sim } from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { hordeSize } from '../src/sim/zombie.ts';
import { buildWorld } from '../src/world/world.ts';
import { ARGUMENTY, MIESZKANCY, opisMieszkancow, swiatMieszkancow } from './bot-mieszkancy.ts';

const SEED = Number(ARGUMENTY[0]) || 1;
const NIGHTS = Number(ARGUMENTY[1]) || 6;
const CORE = Math.max(1, Math.min(5, Math.round(Number(ARGUMENTY[2]) || 4)));

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../public/demo/przymorze.json'), 'utf8'));
// z flagą --mieszkancy świat i opcja `mieszkancy` dla createSim z generatora mieszkańców (tools/bot-mieszkancy.ts)
const osiedle = MIESZKANCY ? await swiatMieszkancow(demo, SEED, CORE) : null;
const world = osiedle ? osiedle.world : buildWorld(demo.geo, { seed: SEED, street: demo.street });
const size = world.size;
const yard = new Set(world.fence.yard);

type Policy = 'warta-dzidy' | 'bez-warty';

interface Night {
  day: number;
  horde: number;
  pressing: number;
  killed: number;
  breaches: number;
  bites: number;
  deaths: number;
  fence: number;
  core: number;
  residents: number;
}

function play(policy: Policy): { nights: Night[]; hash: string; ms: number; over: string; start: string } {
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
  const door = world.buildings[world.hq].entrances[0]?.out ?? 0;
  const skip = new Set<number>();
  let asked = -1;
  while (st.tick < end) {
    sim.step();
    const h = hourOf(st.tick);
    if (h >= 21 || h < 6) peak = Math.max(peak, snapshot(st, world).zombies.pressing);
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
            const two = core()
              .sort((a, b) => b.needs!.health - a.needs!.health || a.id - b.id)
              .slice(0, 2);
            for (const q of two) {
              if (q.weapon !== 'dzida' && st.store.arms?.includes('dzida'))
                sim.push({ t: 'arm', ids: [q.id], weapon: 'dzida' });
              setNight(gov, st.people[q.person].id, 'warta:siatka');
            }
          }
          applyGov(st, world, confirmNight(gov, i));
        }
      }
    }
    // gracz co 10 sekund gry
    if (st.tick % (10 * TICKS_PER_SECOND) === 0) {
      const people = core();
      const armed = people.filter((p) => p.weapon && p.job?.t !== 'guard' && (p.needs?.health ?? 0) > 40);
      // podwórko: uzbrojeni na szwendaczy, którzy weszli
      const inYard = st.pawns.filter((p) => p.kind === 'zombie' && yard.has(tileOf(p)));
      for (const q of armed) {
        if (!inYard.length || q.job?.t === 'fight') continue;
        const z = inYard.sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
        sim.push({ t: 'attack', ids: [q.id], target: z.id });
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
        if (sn.wood < 8 && !chopping && woodman) {
          let best = -1;
          let bd = Number.POSITIVE_INFINITY;
          world.trees.forEach((t, k) => {
            if (t.kind === 2 || st.felled.includes(k) || skip.has(k)) return;
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
      nights.push({
        day: dayOf(st.tick) - 1,
        horde: hordeSize(dayOf(st.tick) - 1),
        pressing: peak,
        killed: now.killed - mark.killed,
        breaches: now.breaches - mark.breaches,
        bites: now.bites - mark.bites,
        deaths: now.deaths - mark.deaths,
        fence: snap.fence.durability,
        core: snap.people.length,
        residents: snap.residents,
      });
      mark = now;
      peak = 0;
    }
  }
  const end_ = gov.over ? `koniec gry: ${gov.over}, dzień ${dayOf(st.tick)}` : 'gra trwa';
  return {
    nights,
    hash: sim.hash(),
    ms: performance.now() - t0,
    start,
    over: `${end_}, zaufanie ${Math.round(gov.trust)}, wkurzenie ${Math.round(gov.anger)}`,
  };
}

console.log(`Bot trybu zombie, ${demo.name}, ziarno ${SEED}, noce ${NIGHTS}, zarząd ${CORE}`);
for (const policy of ['warta-dzidy', 'bez-warty'] as const) {
  const r = play(policy);
  console.log(`\n  ${policy} (${(r.ms / 1000).toFixed(1)} s, skrót ${r.hash}; ${r.over})`);
  if (r.start && policy === 'warta-dzidy') console.log(`  ${r.start}`);
  console.log('  noc  stado  napiera  zabici  przerwania  ugryzienia  zgony  siatka  zarząd  mieszkańcy');
  for (const n of r.nights)
    console.log(
      `  ${String(n.day).padStart(3)}  ${String(n.horde).padStart(5)}  ${String(n.pressing).padStart(7)}  ${String(n.killed).padStart(6)}  ${String(n.breaches).padStart(10)}  ${String(n.bites).padStart(10)}  ${String(n.deaths).padStart(5)}  ${n.fence.toFixed(2).padStart(6)}  ${String(n.core).padStart(6)}  ${String(n.residents).padStart(10)}`,
    );
}
