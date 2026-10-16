import { describe, expect, it } from 'vitest';
import type { Cost, Dom, Res, TechDom } from '../../src/content/data.ts';
import { EVENTS, type EventHost, pickEvent } from '../../src/content/events.ts';
import { type MakePersonOpts, makePerson, type Person } from '../../src/content/people.ts';
import { pick, type Rng } from '../../src/core/rng.ts';
import { loadV03, plain } from '../../tools/v03.ts';

const v = loadV03();
const G = v.G;
const Sim = G.Sim;

// biome-ignore lint/suspicious/noExplicitAny: stan 0.3 bez typów
type S03 = any;

/** EventHost zbudowany na stanie z 0.3. Prymitywy (mood, addPeople, joinSpec...) robi oryginał,
    więc test sprawdza samą treść wydarzeń: teksty, liczby i kolejność losowań. */
function host03(S: S03, rng: Rng): EventHost {
  return {
    rng,
    get res() {
      return S.res as Record<Res, number>;
    },
    get trust() {
      return S.trust as number;
    },
    get t() {
      return S.t as number;
    },
    day: () => Sim.day(S),
    season: () => Sim.season(S),
    law: (id) => Sim.law(S, id),
    tech: (id) => Sim.tech(S, id),
    know: (d: Dom) => Sim.know(S, d),
    rule: (id) => !!S.rules[id],
    pop: () => Sim.pop(S),
    cap: () => Sim.cap(S),
    alive: () => Sim.alive(S),
    spec: (id) => Sim.spec(S, id),
    makePerson: (opts?: MakePersonOpts) =>
      makePerson(rng, new Set(S.specs.map((p: Person) => p.first)), () => S.nextId++, opts),
    joinPerson: (p) => Sim.joinSpec(S, p),
    personLeaves: (p) => {
      p.gone = true;
      Sim.unassign(S, p);
    },
    addPeople: (n) => Sim.addPeople(S, n),
    addRes: (k, val) => Sim.gain(S, { [k]: val }),
    have: (c: Cost) => Sim.have(S, c),
    pay: (c: Cost) => Sim.pay(S, c),
    gain: (c: Cost) => Sim.gain(S, c),
    mood: (a, b) => Sim.mood(S, a, b),
    addSick: (n) => {
      S.sick = n > 0 ? Math.min(Sim.pop(S), S.sick + n) : Math.max(0, S.sick + n);
    },
    log: (txt, big) => Sim.log(S, txt, big),
    hqName: () => S.bldgs[S.hq].name,
    buildingName: (b) => S.bldgs[b].name,
    pickBuilding: (kind) => {
      const f =
        kind === 'home'
          ? (b: S03) => G.RESIDENTIAL.has(b.cls) && b.pop > 0
          : (b: S03) => b.status === 'nasz' && b.heated && b.pop > 0;
      const b: S03 = pick(Sim.ours(S).filter(f), rng);
      return b ? b.idx : null;
    },
    anyHeated: () => S.bldgs.some((b: S03) => b.status === 'nasz' && b.heated),
    removeResident: (i) => {
      const b = S.bldgs[i];
      if (b?.pop) b.pop--;
    },
    burnStaircase: (i) => {
      const b = S.bldgs[i];
      b.cap = Math.max(4, Math.round(b.cap * 0.85));
    },
    hasWorking: (fac) => S.bldgs.some((b: S03) => b.fac && b.fac.id === fac && !b.fac.build && b.fac.staff),
    bookCount: (d: TechDom) => S.books[d] || 0,
    addBook: (d, name) => {
      S.books[d] = (S.books[d] || 0) + 1;
      S.bookList.push(name);
    },
    setAlertNight: () => {
      S.alertNight = Sim.day(S);
    },
    setRaidBoost: () => {
      S.raidBoost = Sim.day(S);
    },
    setSmog: (m) => {
      S.smogUntil = S.t + m;
    },
  };
}

function newState(seed: number): S03 {
  const S = Sim.newGame(JSON.parse(JSON.stringify(G.SAMPLE)), { seed, name: 'Przymorze', src: 'sample' });
  // geometria mapy nie jest potrzebna wydarzeniom, a spowalnia kopiowanie stanu
  S.geo = null;
  for (const b of S.bldgs) b.tiles = [];
  return S;
}

/** Kilka stanów, żeby wagi i warunki wydarzeń przeszły przez różne gałęzie. */
const SCENARIOS: Record<string, (S: S03) => void> = {
  start: () => {},
  zima_prawa: (S) => {
    S.t = 14 * 1440 + 10 * 60;
    Object.assign(S.laws.signed, { u_sad: true, u_godzina: true, u_dokwaterowanie: true });
    S.techs.done.t_kozy = true;
    S.trust = 30;
    S.res.jedzenie = 8;
    S.res.leki = 5;
    S.sick = 5;
    S.books.elek = 2;
    S.books.med = 1;
    const ours = Sim.ours(S);
    ours[0].heated = true;
    ours[0].fac = { id: 'radio', staff: 2, leader: null, build: 0 };
  },
  bogato: (S) => {
    S.t = 6 * 1440 + 12 * 60;
    S.trust = 80;
    S.res = { opal: 30, jedzenie: 120, zlom: 40, czesci: 9, leki: 10, prad: 4 };
    for (let k = 0; k < 6; k++) S.specs.push(Sim.makeSpec(S, G.mulberry(900 + k), { home: S.hq }));
    S.specs[0].skills.elek = 3;
    S.books.bud = 2;
  },
  biednie: (S) => {
    S.t = 25 * 1440 + 9 * 60;
    S.trust = 20;
    S.anger = 70;
    S.res = { opal: 0, jedzenie: 0, zlom: 0, czesci: 0, leki: 0, prad: 0 };
    for (const p of S.specs.slice(2)) p.dead = true;
  },
};

const json = (x: unknown) => plain(x);

describe('wydarzenia z 0.3 działają tak samo po przeniesieniu', () => {
  it('jest 24 wydarzeń w tej samej kolejności', () => {
    expect(EVENTS.map((e) => e.id)).toEqual(G.EVENTS.map((e: S03) => e.id));
    expect(EVENTS).toHaveLength(24);
    expect(EVENTS.map((e) => !!e.once)).toEqual(G.EVENTS.map((e: S03) => !!e.once));
  });

  for (const [name, setup] of Object.entries(SCENARIOS)) {
    describe(name, () => {
      const base = newState(4242);
      setup(base);
      for (const [idx, evNew] of EVENTS.entries()) {
        const evOld = G.EVENTS[idx];
        it(evNew.id, () => {
          for (let seed = 1; seed <= 12; seed++) {
            const So = JSON.parse(JSON.stringify(base));
            const Sn = JSON.parse(JSON.stringify(base));
            v.seed(seed);
            const wO = evOld.w(So);
            const dO = evOld.make(So);
            const viewO = dO && {
              title: evOld.title(So, dO),
              text: evOld.text(So, dO),
              ch: evOld.choices(So, dO).map((c: S03) => ({ label: c.label, ok: c.ok, ai: !!c.ai })),
            };
            v.seed(seed);
            const h = host03(Sn, v.random);
            const wN = evNew.w(h);
            const dN = evNew.make(h);
            const viewN = dN && {
              title: evNew.title(h, dN),
              text: evNew.text(h, dN),
              ch: evNew.choices(h, dN).map((c) => ({ label: c.label, ok: c.ok, ai: !!c.ai })),
            };
            expect(wN).toBe(wO);
            expect(json(dN)).toEqual(json(dO));
            expect(json(viewN)).toEqual(json(viewO));
            expect(json(Sn)).toEqual(json(So));
            if (!dO) continue;
            // każdy wybór na świeżej kopii stanu
            const n = viewO.ch.length;
            for (let k = 0; k < n; k++) {
              const So2 = JSON.parse(JSON.stringify(So));
              const dO2 = JSON.parse(JSON.stringify(dO));
              const Sn2 = JSON.parse(JSON.stringify(Sn));
              const dN2 = JSON.parse(JSON.stringify(dN));
              v.seed(seed * 100 + k);
              evOld.choices(So2, dO2)[k].run();
              v.seed(seed * 100 + k);
              evNew.choices(host03(Sn2, v.random), dN2)[k].run();
              expect(json(Sn2)).toEqual(json(So2));
            }
          }
        });
      }
    });
  }

  it('losowanie wydarzenia (pickEvent) wybiera to samo', () => {
    for (const [name, setup] of Object.entries(SCENARIOS)) {
      for (let seed = 1; seed <= 40; seed++) {
        const base = newState(77);
        setup(base);
        const So = JSON.parse(JSON.stringify(base));
        const Sn = JSON.parse(JSON.stringify(base));
        So.evDone = { lodowka: seed % 2 === 0 };
        Sn.evDone = { lodowka: seed % 2 === 0 };
        v.seed(seed);
        Sim.pickEvent(So);
        v.seed(seed);
        const e = pickEvent(host03(Sn, v.random), Sn.evDone);
        if (e) Sn.event = e;
        expect(json(Sn), `${name} ziarno ${seed}`).toEqual(json(So));
      }
    }
  });
});
