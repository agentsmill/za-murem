/* Sąsiednie budynki w symulacji (docs/M2-fala-2.md): drzwi (otwieranie, zamek, wyważanie z hałasem, deski),
   wnętrze w przechodniości zarządu i obcych, szwendacze w trybie zombie, przeszukanie, łup, który nie jest nasz, dopóki
   ktoś go nie przyniesie, i rozbiórka u sąsiada. Na demie Lanciego (blok 10F trzy klatki obok siedziby) i Batowic. */

import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { PathFinder } from '../../src/sim/path.ts';
import {
  drzwiBudynku,
  drzwiZewnNaStart,
  HALAS,
  LUP_MATS,
  mieszkaniaZaDrzwiami,
  stanDrzwi,
  WYWAZ_KLATKA_TICKS,
  wnetrze,
} from '../../src/sim/sasiedzi.ts';
import { createSim, dismantlable, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { IN } from '../../src/world/interior.ts';
import type { World } from '../../src/world/world.ts';
import { core, demoWorld, doorWhere, newGame, pusto, until } from './sasiedzi-pomoc.ts';

/** kafelek za drzwiami po drugiej stronie niż kafelek przed nimi */
const inside = (door: number, out: number) => 2 * door - out;

describe('sąsiedzi w symulacji: drzwi i wnętrze', () => {
  it('bez cudzych drzwi stan nie ma pola sasiedzi', () => {
    const sim = newGame('lanciego');
    for (let k = 0; k < 400; k++) sim.step();
    expect(sim.st.sasiedzi).toBeUndefined();
  });

  it('otwarcie drzwi bez klucza dołącza wnętrze: zarząd wchodzi, mieszkańcy nie, meble są rzeczami', () => {
    const w = demoWorld('lanciego');
    const { bid, door, out } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k);
    const sim = newGame('lanciego');
    const p = core(sim)[0];
    const before = sim.st.things.length;
    expect(sim.canWalk('core', door)).toBe(false);
    sim.push({ t: 'open', ids: [p.id], door });
    sim.step();
    expect(p.job?.t).toBe('door');
    until(sim, () => p.job?.t !== 'door');
    const b = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    expect(b.otwarty).toBe(true);
    expect(stanDrzwi(b, door)?.s).toBe('otwarte');
    expect(sim.canWalk('core', door)).toBe(true);
    expect(sim.canWalk('core', inside(door, out))).toBe(true);
    expect(sim.canWalk('resident', inside(door, out))).toBe(false);
    const inB = sim.st.things.filter((t) => w.bid[t.y * w.size + t.x] === bid);
    expect(inB.filter((t) => t.kind !== 'smieci').length).toBe(wnetrze(w, bid).furniture.length);
    expect(sim.st.things.length).toBe(before + inB.length);
    expect(b.zawartosc).toBeUndefined();
    // ściany dalej blokują
    const wall = [...Array(w.size * w.size).keys()].find(
      (i) => w.bid[i] === bid && wnetrze(w, bid).cell[i] === IN.WALL,
    )!;
    expect(sim.canWalk('core', wall)).toBe(false);
  });

  it('zamknięte na klucz: Otworzyć daje na_klucz, wyważenie trwa 40 min gry z hałasem 25 m, z łomem połowa i 12 m', () => {
    const w = demoWorld('lanciego');
    const { bid, door } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !!s.k);
    const force = (lom: boolean) => {
      const sim = newGame('lanciego');
      const p = core(sim)[0];
      p.weapon = lom ? 'lom' : null;
      sim.push({ t: 'open', ids: [p.id], door });
      sim.step();
      until(sim, () => p.job?.t !== 'door');
      const b = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
      expect(stanDrzwi(b, door)?.s).toBe('na_klucz');
      expect(sim.st.sasiedzi!.napis?.co).toBe('na_klucz');
      sim.push({ t: 'force', ids: [p.id], door });
      sim.step();
      until(sim, () => p.job?.phase === 1);
      const t0 = sim.st.tick;
      let r = 0;
      until(sim, () => {
        for (const n of sim.st.noise ?? []) r = Math.max(r, n.r);
        return p.job?.t !== 'door';
      });
      expect(stanDrzwi(b, door)?.s).toBe('wywazone');
      expect(b.otwarty).toBe(true);
      return { ticks: sim.st.tick - t0, r };
    };
    const plain = force(false);
    const lom = force(true);
    expect(Math.abs(plain.ticks - WYWAZ_KLATKA_TICKS)).toBeLessThanOrEqual(2);
    expect(Math.abs(lom.ticks - WYWAZ_KLATKA_TICKS / 2)).toBeLessThanOrEqual(2);
    expect(plain.r).toBe(HALAS.wywazanie);
    expect(lom.r).toBe(HALAS.wywazanieLom);
  });

  it('zabite deskami blokują wszystkich, a odbicie desek przywraca przejście', () => {
    const w = demoWorld('lanciego');
    const { door } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k);
    const sim = newGame('lanciego');
    const p = core(sim)[0];
    sim.push({ t: 'open', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    const boards = () => sim.st.things.filter((t) => t.kind === 'deski').reduce((a, t) => a + t.n, 0);
    const have = boards();
    expect(have).toBeGreaterThanOrEqual(2);
    sim.push({ t: 'board', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    expect(boards()).toBe(have - 2);
    expect(sim.canWalk('core', door)).toBe(false);
    expect(sim.canWalk('szabrownik', door)).toBe(false);
    sim.push({ t: 'unboard', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    expect(sim.canWalk('core', door)).toBe(true);
  });

  it('tryb zombie: szwendacze przechodzą wyważonymi drzwiami, zamkniętymi nie', () => {
    const w = demoWorld('lanciego');
    const { bid, door } = doorWhere(w, 'zombie', (s) => s.s === 'zamkniete');
    const sim = newGame('lanciego', 'zombie');
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    const p = core(sim)[0];
    p.weapon = 'lom';
    sim.push({ t: 'force', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    const b = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    expect(stanDrzwi(b, door)?.s).toBe('wywazone');
    expect(sim.canWalk('zombie', door)).toBe(true);
    const shut = b.drzwi.find((d) => d.t !== door && !['otwarte', 'wywazone'].includes(d.s));
    if (shut) expect(sim.canWalk('zombie', shut.t)).toBe(false);
  });

  it('drzwi od ulicy budynku przy podwórku: zawsze na klucz, a otwarte robią drogę z ulicy przez wnętrze na podwórko', () => {
    // dom z dwojgiem drzwi na zewnątrz (drugie dołożył generator wnętrza)
    const base = demoWorld('zielonki');
    const b = base.buildings.find((x) => x.name === 'Dom nr 8')!;
    const dz = drzwiBudynku(base, b.id);
    expect(dz.zewn.length).toBe(2);
    // świat, w którym kafelek przed pierwszymi drzwiami leży na podwórku siedziby
    const [yardDoor, street] = dz.zewn;
    const w: World = { ...base, fence: { ...base.fence, yard: [...base.fence.yard, yardDoor.out] } };
    expect(drzwiZewnNaStart(w, 'zwykly', b.id, street.tile)).toMatchObject({ s: 'zamkniete', k: true });
    const sim = new Sim(w, createSim(w, 5, { core: 4 }));
    const [p, q] = core(sim);
    // obie drzwi wyważone: obcy (sim.blocked to ich przechodniość) przejdą z ulicy przez dom na podwórko
    sim.push({ t: 'force', ids: [p.id], door: yardDoor.tile });
    sim.push({ t: 'force', ids: [q.id], door: street.tile });
    sim.step();
    until(sim, () => p.job?.t !== 'door' && q.job?.t !== 'door');
    const pf = new PathFinder(w.size);
    expect(pf.find(sim.blocked, street.out, yardDoor.out)).not.toBeNull();
  });
});

describe('sąsiedzi w symulacji: szwendacze w mieszkaniach', () => {
  it('tryb zombie: otwarcie drzwi mieszkania z wymarcia wypuszcza szwendacza za drzwiami', () => {
    const w = demoWorld('lanciego');
    const sim = newGame('lanciego', 'zombie');
    sim.st.pawns = sim.st.pawns.filter((q) => q.kind !== 'zombie');
    const p = core(sim)[0];
    p.weapon = 'lom';
    // blok z drzwiami mieszkań za wyważonymi drzwiami klatki; jedno mieszkanie za nimi dostaje szwendacza
    const { bid, door } = doorWhere(
      w,
      'zombie',
      (s, id) =>
        s.s === 'zamkniete' && mieszkaniaZaDrzwiami(w, id, s.t).size > 0 && drzwiBudynku(w, id).mieszkan.size > 0,
    );
    sim.lokatorzy = pusto(w);
    sim.push({ t: 'force', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    const b = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    const behind = mieszkaniaZaDrzwiami(w, bid, door);
    const [flatDoor, apt] = [...drzwiBudynku(w, bid).mieszkan.entries()].find(([, a]) => behind.has(a))!;
    b.mieszkania.find((m) => m.apt === apt)!.zombie = true;
    stanDrzwi(b, flatDoor)!.s = 'zamkniete';
    delete stanDrzwi(b, flatDoor)!.k;
    const zombies = () => sim.st.pawns.filter((q) => q.kind === 'zombie').length;
    const z0 = zombies();
    sim.push({ t: 'open', ids: [p.id], door: flatDoor });
    sim.step();
    until(sim, () => p.job?.t !== 'door');
    expect(zombies()).toBe(z0 + 1);
    expect(sim.st.sasiedzi!.napis?.co).toBe('szwendacz');
    const z = sim.st.pawns.filter((q) => q.kind === 'zombie').at(-1)!;
    expect(w.bid[Math.floor(z.y) * w.size + Math.floor(z.x)]).toBe(bid);
  });
});

describe('sąsiedzi w symulacji: przeszukanie i łup', () => {
  /** gra z otwartym blokiem bez lokatorów (wszystkie mieszkania puste) i osobą w środku */
  const opened = () => {
    const w = demoWorld('lanciego');
    const { bid, door, out } = doorWhere(w, 'zwykly', (s) => s.s === 'zamkniete' && !s.k, ['blok']);
    const sim = newGame('lanciego');
    sim.lokatorzy = pusto(w);
    const p = core(sim)[0];
    sim.push({ t: 'open', ids: [p.id], door });
    sim.step();
    until(sim, () => p.job?.t !== 'door' && p.job?.t !== 'go');
    const k = sim.st.sasiedzi!.budynki.findIndex((x) => x.bid === bid);
    return { w, sim, p, bid, k, door, out };
  };

  it('przeszukanie pokoju u sąsiada: łup w pokoju, raz, a potem przeszukujący sam nosi łup na podwórko', () => {
    const { w, sim, p, bid, door } = opened();
    const it0 = wnetrze(w, bid);
    const behind = mieszkaniaZaDrzwiami(w, bid, door);
    const room =
      it0.rooms.find((r) => behind.has(r.apt) && r.kind === 'kuchnia') ?? it0.rooms.find((r) => behind.has(r.apt))!;
    sim.push({ t: 'loot', ids: [p.id], bid, room: room.id });
    sim.step();
    expect(p.job?.t).toBe('loot');
    until(sim, () => p.job?.t !== 'loot');
    const b = sim.st.sasiedzi!.budynki.find((x) => x.bid === bid)!;
    const m = b.mieszkania.find((x) => x.apt === room.apt)!;
    expect(m.przeszukane).toContain(room.id);
    // drugi raz nie
    sim.push({ t: 'loot', ids: [p.id], bid, room: room.id });
    sim.step();
    expect(p.job?.t).not.toBe('loot');
    // łup leży w budynku i nie liczy się do zapasów, dopóki go nie przyniosą
    const inBuilding = () =>
      sim.st.things
        .filter((t) => LUP_MATS.has(t.kind) && w.bid[t.y * w.size + t.x] === bid)
        .reduce((a, t) => a + t.n, 0);
    // kuchnia pustego mieszkania na Lanciego (ziarno 5) daje 5 sztuk
    expect(inBuilding()).toBeGreaterThan(0);
    expect(snapshot(sim.st, w).stock.uSasiadow).toBeDefined();
    const yard = new Set(w.fence.yard);
    const atHome = () =>
      sim.st.things.filter((t) => LUP_MATS.has(t.kind) && yard.has(t.y * w.size + t.x)).reduce((a, t) => a + t.n, 0);
    const before = atHome();
    until(sim, () => inBuilding() === 0 && p.job?.t !== 'carry', 8000);
    expect(inBuilding()).toBe(0);
    expect(atHome()).toBeGreaterThan(before);
    expect(snapshot(sim.st, w).stock.uSasiadow).toBeUndefined();
  });

  it('sterta jedzenia u sąsiada: pasek i zarząd jej nie liczą, głodny po nią nie idzie', () => {
    const { w, sim, bid, k } = opened();
    const room = wnetrze(w, bid).rooms.find((r) => sim.kafelkiPokoju(k * 4096 + r.id).length > 0)!;
    const tile = sim.kafelkiPokoju(k * 4096 + room.id)[0];
    const food = {
      id: 99999,
      kind: 'jedzenie',
      x: tile % w.size,
      y: Math.floor(tile / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 7,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    sim.st.things.push(food);
    const s = snapshot(sim.st, w);
    expect(s.stock.uSasiadow?.jedzenie).toBe(7);
    // poza stertą u sąsiada jedzenia nie ma: zarząd nie ma czego jeść
    sim.st.things = sim.st.things.filter((t) => t.kind !== 'jedzenie' || t === food);
    for (const q of core(sim)) if (q.needs) q.needs.food = 5;
    for (let n = 0; n < 2000; n++) sim.step();
    expect(sim.st.things.find((t) => t.id === 99999)?.n).toBe(7);
  });

  it('u sąsiada meble pustego mieszkania rozbiera się dopiero po przeszukaniu pomieszczenia', () => {
    const { w, sim, p, bid, door } = opened();
    const it0 = wnetrze(w, bid);
    // mebel w mieszkaniu tej klatki, do której prowadzą otwarte drzwi
    const behind = mieszkaniaZaDrzwiami(w, bid, door);
    const t = sim.st.things.find((x) => {
      const r = it0.room[x.y * w.size + x.x];
      return (
        w.bid[x.y * w.size + x.x] === bid &&
        r >= 0 &&
        behind.has(it0.rooms[r].apt) &&
        ['stol', 'krzeslo', 'mebloscianka', 'lozko', 'wersalka'].includes(x.kind)
      );
    })!;
    expect(dismantlable(sim.st, w, t)).toBe(false);
    const room = it0.room[t.y * w.size + t.x];
    sim.push({ t: 'loot', ids: [p.id], bid, room });
    sim.step();
    until(sim, () => p.job?.t !== 'loot');
    expect(dismantlable(sim.st, w, t)).toBe(true);
  });

  it('zapis i wczytanie z otwartym budynkiem dają ten sam dalszy przebieg', () => {
    const { w, sim } = opened();
    for (let k = 0; k < 300; k++) sim.step();
    const copy = new Sim(w, JSON.parse(JSON.stringify(sim.st)));
    expect(copy.hash()).toBe(sim.hash());
    for (let k = 0; k < 2 * TICKS_PER_HOUR; k++) {
      sim.step();
      copy.step();
    }
    expect(copy.hash()).toBe(sim.hash());
  });
});
