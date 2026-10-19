/* Łańcuch wspólnego płotu w symulacji: na Lanciego najpierw 10F, potem 10H (ten sam obwód rośnie dwa razy). Po każdym
   budynku płot jest zapisany w stanie, a z ulicy nie ma drogi na podwórko poza bramą i dziurami ze startu. Na końcu
   zapis i wczytanie na świeżym świecie dają tę samą siatkę i ten sam skrót po dalszych krokach. Otoczenie zmienia
   świat w miejscu, więc test buduje własny świat zamiast wspólnego z pamięci. Wzory: plot.test.ts. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashString } from '../../src/core/rng.ts';
import { hourOf, TICKS_PER_DAY } from '../../src/sim/clock.ts';
import { gateTiles } from '../../src/sim/perimeter.ts';
import { drzwiBudynku, kosztPlotu, plotDla } from '../../src/sim/sasiedzi.ts';
import { createSim, type Pawn, Sim, type SimState } from '../../src/sim/sim.ts';
import { T } from '../../src/world/terrain.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { core, until } from './sasiedzi-pomoc.ts';

/** świeży świat dema (bez pamięci: symulacja zmieni w nim siatkę) */
function swiezy(key: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${key}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

const byName = (w: World, name: string) => w.buildings.find((b) => b.name === name)!;

/** Czy z ulicy da się dojść na podwórko inaczej niż przez bramę i dziury ze startu: przejście po kafelkach bokiem,
    bez przeszkód (w.blocked), kafelków siatki, dziur i bramy. `otworz`: kafelki, które zdejmuje się z murów (próba
    kontrolna, czy przejście w ogóle coś widzi). Zwraca też liczbę odwiedzonych kafelków. */
function drogaZUlicyNaPodworko(w: World, otworz: readonly number[] = []): { droga: boolean; odwiedzone: number } {
  const size = w.size;
  const mur = new Set<number>([...w.fence.tiles, ...w.fence.hole, ...gateTiles(w)]);
  for (const t of otworz) mur.delete(t);
  const yard = new Set(w.fence.yard);
  // start: pierwszy wolny kafelek jezdni poza podwórkiem
  const start = w.terr.findIndex((v, i) => v === T.ROAD && !w.blocked[i] && !yard.has(i) && !mur.has(i));
  const widziany = new Uint8Array(size * size);
  const kolejka = [start];
  widziany[start] = 1;
  let odwiedzone = 0;
  for (let k = 0; k < kolejka.length; k++) {
    const t = kolejka[k];
    odwiedzone++;
    if (yard.has(t)) return { droga: true, odwiedzone };
    const x = t % size;
    for (const n of [t - size, t + size, x > 0 ? t - 1 : -1, x < size - 1 ? t + 1 : -1]) {
      if (n < 0 || n >= size * size || widziany[n] || w.blocked[n] || mur.has(n)) continue;
      widziany[n] = 1;
      kolejka.push(n);
    }
  }
  return { droga: false, odwiedzone };
}

describe('wspólny płot: łańcuch na Lanciego', () => {
  it('Lanciego: 10F, potem 10H, obwód szczelny po każdym, zapis i wczytanie', () => {
    const w = swiezy('lanciego');
    const sim = new Sim(w, createSim(w, 5, { core: 4 }));
    const p: Pawn = core(sim)[0];
    p.weapon = 'lom';

    /** Zarząd bez kozy i jedzenia po dobie pracy jest wyziębiony, głodny i na granicy życia (praca przy drzwiach
        i płocie zostaje przerwana jako pilna potrzeba), a ten test sprawdza płot, nie przeżycie: potrzeby wracają
        na sto przed każdym poleceniem. */
    const podkarm = () => {
      for (const q of core(sim)) Object.assign(q.needs!, { food: 100, warm: 100, rest: 100, health: 100 });
    };
    /** czeka na poranek, żeby osoba miała cały dzień na drzwi */
    const doRana = () => {
      if (hourOf(sim.st.tick) < 7 || hourOf(sim.st.tick) >= 12)
        until(sim, () => hourOf(sim.st.tick) === 9, 2 * TICKS_PER_DAY);
      expect(hourOf(sim.st.tick)).toBeGreaterThanOrEqual(7);
      podkarm();
    };
    const dzien = () => hourOf(sim.st.tick) >= 7 && hourOf(sim.st.tick) < 17;

    /** otwiera drzwi budynku: `open`, potem (gdy drzwi na klucz albo praca przerwana) `force` łomem; polecenie wraca
        tylko za dnia, gdy osoba nie ma pracy i kolejka jest pusta */
    const otworz = (bid: number) => {
      const b = w.buildings[bid];
      const door = b.entrances[0].tile;
      const otwarty = () => sim.st.sasiedzi?.budynki.find((x) => x.bid === bid)?.otwarty === true;
      doRana();
      let proby = 0;
      for (let n = 0; n < 40_000 && !otwarty(); n++) {
        if (n % 20 === 0 && dzien() && p.job === null && !sim.st.cmds.length) {
          podkarm();
          sim.push({ t: proby++ === 0 ? 'open' : 'force', ids: [p.id], door });
        }
        sim.step();
      }
      expect(otwarty(), `${b.name}: drzwi otwarte`).toBe(true);
    };

    /** dosypuje materiał z kosztu płotu na wolne kafelki podwórka (sterty po 10, zapas 4 sztuki) */
    const dosyp = (need: Partial<Record<string, number>>) => {
      const zajete = new Set(sim.st.things.map((t) => t.y * w.size + t.x));
      const wolne = w.fence.yard.filter((i) => !w.blocked[i] && !zajete.has(i));
      let k = 0;
      for (const [kind, ile] of Object.entries(need) as [string, number][])
        for (let left = ile + 4; left > 0; left -= 10) {
          const i = wolne[k++];
          sim.st.things.push({
            id: sim.st.nextThing++,
            kind,
            x: i % w.size,
            y: Math.floor(i / w.size),
            w: 1,
            h: 1,
            rot: 0,
            n: Math.min(10, left),
            fuel: 0,
            by: -1,
            owner: -1,
          });
        }
    };

    /** buduje płot do końca; po przerwaniu przez potrzeby polecenie wraca, ale tylko za dnia przy wolnej osobie */
    const otocz = (bid: number) => {
      sim.push({ t: 'enclose', ids: [p.id], bid });
      sim.step();
      for (let n = 0; n < 60_000 && !sim.st.plot?.bids.includes(bid); n++) {
        sim.step();
        if (n % 400 === 0) podkarm();
        if (n % 400 === 0 && sim.st.plot?.plan && p.job?.t !== 'plot' && !sim.st.cmds.length)
          sim.push({ t: 'enclose', ids: [p.id], bid });
      }
    };

    const ids: number[] = [];
    for (const name of ['Blok nr 10F', 'Blok nr 10H']) {
      const b = byName(w, name);
      ids.push(b.id);
      otworz(b.id);
      const r = plotDla(sim.st, w, b.id);
      if (!r?.ok) throw new Error(`${name} bez płotu`);
      dosyp(kosztPlotu(r).need);
      const przed = w.fence.tiles.length;
      otocz(b.id);
      expect(sim.st.plot?.bids, name).toContain(b.id);
      expect(sim.st.plot?.plan, name).toBeUndefined();
      // siatka urosła o korytarz, a wszystkie wejścia budynku są na podwórku
      expect(w.fence.tiles.length, `${name}: siatka`).toBeGreaterThan(przed);
      for (const d of drzwiBudynku(w, b.id).zewn) expect(w.fence.yard, `${name}: wejście`).toContain(d.out);
      // obwód szczelny: z ulicy na podwórko tylko bramą i dziurami ze startu
      const szczelny = drogaZUlicyNaPodworko(w);
      expect(szczelny.odwiedzone, `${name}: przejście coś widzi`).toBeGreaterThan(1000);
      expect(szczelny.droga, `${name}: droga z ulicy na podwórko`).toBe(false);
      // próba kontrolna: bez murów przejście dociera na podwórko
      expect(drogaZUlicyNaPodworko(w, w.fence.tiles).droga, `${name}: kontrola`).toBe(true);
    }

    expect(sim.st.plot?.bids).toEqual(ids);
    expect(ids).toHaveLength(2);

    // zapis i wczytanie na świeżym świecie: ta sama siatka i dalszy przebieg
    const w2 = swiezy('lanciego');
    const copy = new Sim(w2, JSON.parse(JSON.stringify(sim.st)) as SimState);
    expect(w2.fence.tiles).toEqual(w.fence.tiles);
    for (let k = 0; k < 400; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});
