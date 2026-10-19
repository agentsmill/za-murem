/* Odczyt pracy ludzi dla interfejsu (src/sim/snapshot.ts): `populacja` liczy zarząd (także na wyprawie) i mieszkańców
   siedziby, bez sąsiadów i gości; `SimPerson` niesie indeks osoby, „sam” (praca bez polecenia) i ustawienia pracy
   w kolejności RODZAJE; `SimSnapshot.praca` ma progi i widoczne rodzaje; `sim.ileZlecen(r)` liczy czekające zlecenia
   na żądanie, poza stanem i tylko to, co ktoś z zarządu mógłby wziąć: poniżej progu zapasu, a cele poza naszym terenem
   dopiero, gdy ktoś z żywych ma przełącznik „za siatkę”. Odczyt niczego w stanie nie zmienia (ten sam skrót i ten
   sam JSON przed i po). */

import { describe, expect, it } from 'vitest';
import { makePerson } from '../../src/content/people.ts';
import { mulberry } from '../../src/core/rng.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import { searchable } from '../../src/sim/mieszkania.ts';
import { priorytet, progi, RODZAJE, type RodzajPracy, WPISY } from '../../src/sim/praca.ts';
import { moznaPrzeszukac, wnetrze } from '../../src/sim/sasiedzi.ts';
import type { Pawn, Sim, Thing } from '../../src/sim/sim.ts';
import { populacja, snapshot } from '../../src/sim/snapshot.ts';
import { wreckStage, wrecksOf, wreckTile } from '../../src/sim/surowce.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { core, demoWorld, newGame, pusto } from './sasiedzi-pomoc.ts';

const KLUCZ = 'lanciego';
const kolumna = (r: RodzajPracy): number => RODZAJE.indexOf(r);

/** prywatne części Sim, po które sięga scena (kontrakt testowy, nie API gry) */
interface Prywatne {
  newJob(t: 'patch', target: number, tile: number, order: boolean): NonNullable<Pawn['job']>;
  zapasDrewna(): number;
  insideAt(tile: number): boolean;
  naszTeren(tile: number): boolean;
  trunk: number[];
  dry: number;
}
const prv = (sim: Sim): Prywatne => sim as unknown as Prywatne;

describe('populacja', () => {
  it('zarząd z wyprawą, mieszkańcy, bez sąsiadów i gości', () => {
    const sim = newGame(KLUCZ);
    const st = sim.st;
    const w = demoWorld(KLUCZ);
    const mieszkancow = st.pawns.filter((p) => p.kind === 'resident').length;
    expect(mieszkancow).toBeGreaterThan(0);
    const bazowa = populacja(st);
    expect(bazowa).toEqual({ zarzad: 4, mieszkancy: mieszkancow, razem: 4 + mieszkancow });
    // wyprawa za mapą dalej jest w zarządzie
    core(sim)[0].away = true;
    expect(populacja(st)).toEqual(bazowa);
    // sąsiedzi, szabrownicy, szwendacze, handlarz, wędrowiec, obca ekipa, jej ludzie i tłum to nie nasza ludność
    const wzor = st.pawns.find((p) => p.kind === 'resident')!;
    let id = 9000;
    for (const kind of ['sasiad', 'szabrownik', 'zombie', 'handlarz', 'wedrowiec', 'obcy', 'zbir', 'crowd'] as const)
      st.pawns.push({ ...structuredClone(wzor), id: id++, kind });
    expect(populacja(st)).toEqual(bazowa);
    // odczyt dla interfejsu liczy tak samo
    const s = snapshot(st, w);
    expect(s.people.length + s.residents).toBe(bazowa.razem);
    expect(s.residents).toBe(bazowa.mieszkancy);
  });

  it('rośnie z nowym mieszkańcem i zarządem, maleje z odejściem; pusta gra to zero', () => {
    const sim = newGame(KLUCZ);
    const st = sim.st;
    const przed = populacja(st);
    const mieszkaniec = st.pawns.find((p) => p.kind === 'resident')!;
    st.pawns = st.pawns.filter((p) => p !== mieszkaniec);
    expect(populacja(st)).toEqual({ ...przed, mieszkancy: przed.mieszkancy - 1, razem: przed.razem - 1 });
    st.pawns = st.pawns.filter((p) => p.kind !== 'core' && p.kind !== 'resident');
    expect(populacja(st)).toEqual({ zarzad: 0, mieszkancy: 0, razem: 0 });
  });
});

describe('naszTerenKafelek', () => {
  it('to samo co naszTeren na każdym kafelku (odczyt dla tools/bot-praca.ts): podwórko nasze, daleka ulica nie', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const s = prv(sim);
    let nasze = 0;
    let rozne = 0;
    for (let i = 0; i < w.size * w.size; i++) {
      const jest = sim.naszTerenKafelek(i);
      if (jest !== s.naszTeren(i)) rozne++;
      if (jest) nasze++;
    }
    expect(rozne).toBe(0);
    expect(nasze).toBeGreaterThan(0);
    expect(nasze).toBeLessThan((w.size * w.size) / 4);
    expect(sim.naszTerenKafelek(w.fence.yard[0])).toBe(true);
    expect(sim.naszTerenKafelek(0)).toBe(false);
  });
});

describe('odczyt osoby: praca', () => {
  it('indeks osoby i priorytety w kolejności RODZAJE, badania ukryte na 0', () => {
    const sim = newGame(KLUCZ);
    const s = snapshot(sim.st, demoWorld(KLUCZ));
    expect(s.people).toHaveLength(4);
    for (const p of s.people) {
      const pionek = sim.st.pawns.find((q) => q.id === p.pawn)!;
      expect(p.osoba).toBe(pionek.person);
      expect(sim.st.people[p.osoba].id).toBe(p.id);
      expect(p.praca.prio).toHaveLength(RODZAJE.length);
      expect(p.praca.prio[kolumna('ogien')]).toBe(1);
      expect(p.praca.prio[kolumna('noszenie')]).toBe(3);
      expect(p.praca.prio[kolumna('szaber')]).toBe(3);
      expect(p.praca.prio[kolumna('badania')]).toBe(0);
      expect(p.praca.stale).toBeNull();
      expect(p.praca.zaSiatke).toBe(false);
    }
  });

  it('zmiany gracza: priorytet w swojej kolumnie, stałe zajęcie, przełącznik za siatkę; inne osoby bez zmian', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const [a, b] = core(sim);
    const dom = snapshot(sim.st, w).people.find((p) => p.pawn === b.id)!.praca;
    sim.push({ t: 'prio', ids: [], osoba: a.person, rodzaj: 'drwal', prio: 4 });
    sim.push({ t: 'prio', ids: [], osoba: a.person, rodzaj: 'kuchnia', prio: 0 });
    sim.push({ t: 'stale', ids: [], osoba: a.person, rodzaj: 'warsztat' });
    sim.push({ t: 'zasiatke', ids: [], osoba: a.person, on: true });
    sim.step();
    const s = snapshot(sim.st, w);
    const pa = s.people.find((p) => p.pawn === a.id)!;
    expect(pa.osoba).toBe(a.person);
    expect(pa.praca.prio[kolumna('drwal')]).toBe(4);
    expect(pa.praca.prio[kolumna('kuchnia')]).toBe(0);
    expect(pa.praca.stale).toBe('warsztat');
    expect(pa.praca.zaSiatke).toBe(true);
    // reszta kolumn tej osoby to domyślne
    for (const r of RODZAJE) {
      if (r === 'drwal' || r === 'kuchnia') continue;
      const dane = snapshot({ ...sim.st, praca: undefined }, w).people.find((p) => p.pawn === a.id)!;
      expect(pa.praca.prio[kolumna(r)], r).toBe(dane.praca.prio[kolumna(r)]);
    }
    expect(s.people.find((p) => p.pawn === b.id)!.praca).toEqual(dom);
    // zdjęcie stałego zajęcia i przełącznika wraca do domyślnych
    sim.push({ t: 'stale', ids: [], osoba: a.person, rodzaj: null });
    sim.push({ t: 'zasiatke', ids: [], osoba: a.person, on: false });
    sim.step();
    const po = snapshot(sim.st, w).people.find((p) => p.pawn === a.id)!.praca;
    expect(po.stale).toBeNull();
    expect(po.zaSiatke).toBe(false);
  });

  it('mieszkaniec z osobą (generator) ma indeks osoby i domyślne ustawienia, bez zmian gracza', () => {
    const sim = newGame(KLUCZ);
    const st = sim.st;
    const w = demoWorld(KLUCZ);
    const mieszkaniec = st.pawns.find((p) => p.kind === 'resident')!;
    st.people.push(makePerson(mulberry(31), new Set(st.people.map((q) => q.first)), () => st.nextId++));
    mieszkaniec.person = st.people.length - 1;
    const l = snapshot(st, w).lokatorzy.find((q) => q.pawn === mieszkaniec.id)!;
    expect(l.osoba).toBe(mieszkaniec.person);
    expect(l.praca.prio).toEqual(RODZAJE.map((r) => priorytet(st, mieszkaniec.person, r)));
    expect(l.praca.stale).toBeNull();
    expect(l.praca.zaSiatke).toBe(false);
    // ustawienia przyjmuje tylko zarząd: polecenie dla mieszkańca nic nie zmienia
    sim.push({ t: 'prio', ids: [], osoba: mieszkaniec.person, rodzaj: 'drwal', prio: 4 });
    sim.step();
    expect(st.praca).toBeUndefined();
  });

  it('sam: praca zaczęta bez polecenia tak, polecenie gracza i bezczynność nie', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const [a, b] = core(sim);
    const sam = (p: Pawn) => snapshot(sim.st, w).people.find((q) => q.pawn === p.id)!.sam;
    // start: nikt nic nie robi
    expect(a.job).toBeNull();
    expect(sam(a)).toBe(false);
    // polecenie gracza: praca z order, więc nie „sam”
    sim.push({ t: 'move', ids: [a.id], to: Math.floor(b.y) * w.size + Math.floor(b.x) });
    sim.step();
    expect(a.job?.order).toBe(true);
    expect(sam(a)).toBe(false);
    // praca bez polecenia (ta, którą pionek wybrał sam): „sam” zgadza się z job.order === false
    const sztuczna = { ...structuredClone(a.job!), order: false };
    a.job = sztuczna;
    expect(sam(a)).toBe(true);
    a.job = null;
    expect(sam(a)).toBe(false);
  });

  it('sam zgadza się z job.order przez pół godziny gry, dla zarządu i mieszkańców', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    // głodni i zmarznięci sami idą jeść i do kozy: praca bez polecenia
    for (const p of core(sim)) {
      p.needs!.food = 8;
      p.needs!.warm = 20;
    }
    let samych = 0;
    for (let k = 0; k < TICKS_PER_HOUR / 2; k++) {
      sim.step();
      if (k % 40) continue;
      const s = snapshot(sim.st, w);
      for (const p of [...s.people, ...s.lokatorzy]) {
        const pionek = sim.st.pawns.find((q) => q.id === p.pawn)!;
        expect(p.sam, `pionek ${p.pawn} w kroku ${k}`).toBe(!!pionek.job && pionek.job.order === false);
        if (p.sam) samych++;
      }
    }
    expect(samych).toBeGreaterThan(0);
  });
});

describe('odczyt gry: progi i widoczne rodzaje', () => {
  it('domyślne progi i widoczne rodzaje bez pracowni (bez badań)', () => {
    const sim = newGame(KLUCZ);
    const s = snapshot(sim.st, demoWorld(KLUCZ));
    expect(s.praca.progi).toEqual({ drewno: 30, deski: 20, czesci: 10, dzidy: 0 });
    expect(s.praca.widoczne).toEqual(RODZAJE.filter((r) => r !== 'badania'));
    expect(s.praca.widoczne).toEqual(RODZAJE.filter((r) => WPISY[r].widoczny(sim.st)));
  });

  it('zmieniony próg widać w odczycie, a w trybie zombie dzidy mają 12', () => {
    const sim = newGame(KLUCZ);
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 45 });
    sim.step();
    expect(snapshot(sim.st, demoWorld(KLUCZ)).praca.progi).toEqual({ ...progi(sim.st), drewno: 45 });
    expect(snapshot(sim.st, demoWorld(KLUCZ)).praca.progi.drewno).toBe(45);
    const zombie = newGame(KLUCZ, 'zombie');
    expect(snapshot(zombie.st, demoWorld(KLUCZ)).praca.progi.dzidy).toBe(12);
  });

  it('odczyt jest kopią: zmiana wyniku nie rusza stanu', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const s = snapshot(sim.st, w);
    s.praca.progi.drewno = 999;
    s.praca.widoczne.pop();
    s.people[0].praca.prio[0] = 4;
    const drugi = snapshot(sim.st, w);
    expect(drugi.praca.progi.drewno).toBe(30);
    expect(drugi.praca.widoczne).toHaveLength(RODZAJE.length - 1);
    expect(drugi.people[0].praca.prio[0]).toBe(1);
  });
});

describe('odczyt nie zmienia stanu', () => {
  it('skrót i cały JSON stanu przed i po snapshot, populacja i ileZlecen', () => {
    for (const klucz of ['lanciego', 'przymorze', 'zielonki']) {
      const sim = newGame(klucz);
      const w = demoWorld(klucz);
      for (let k = 0; k < 400; k++) sim.step();
      const hash = sim.hash();
      const json = JSON.stringify(sim.st);
      snapshot(sim.st, w);
      populacja(sim.st);
      for (const r of RODZAJE) sim.ileZlecen(r);
      expect(sim.hash(), klucz).toBe(hash);
      expect(JSON.stringify(sim.st), klucz).toBe(json);
      // i dalszy przebieg jest taki sam jak bez odczytu
      const bez = newGame(klucz);
      for (let k = 0; k < 400; k++) bez.step();
      for (let k = 0; k < 200; k++) {
        sim.step();
        bez.step();
      }
      expect(sim.hash(), klucz).toBe(bez.hash());
    }
  });
});

describe('ileZlecen', () => {
  const wszystkie = (sim: Sim): Record<RodzajPracy, number> =>
    Object.fromEntries(RODZAJE.map((r) => [r, sim.ileZlecen(r)])) as Record<RodzajPracy, number>;

  it('liczba całkowita, nieujemna, badania (bez pracowni ukryte) zawsze 0', () => {
    for (const klucz of ['lanciego', 'przymorze', 'zielonki']) {
      const sim = newGame(klucz);
      for (let k = 0; k < 200; k++) sim.step();
      for (const [r, n] of Object.entries(wszystkie(sim))) {
        expect(Number.isInteger(n), `${klucz} ${r}`).toBe(true);
        expect(n, `${klucz} ${r}`).toBeGreaterThanOrEqual(0);
      }
      expect(sim.ileZlecen('badania')).toBe(0);
    }
  });

  it('budowa: plan bez wykonawcy liczy się, plan z wykonawcą nie', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    expect(sim.ileZlecen('budowa')).toBe(0);
    const at = allowedAnchors(sim.st, w, 'ogrodek', 0)[0];
    sim.push({ t: 'build', ids: [], kind: 'ogrodek', x: at % w.size, y: Math.floor(at / w.size), rot: 0 });
    sim.step();
    expect(sim.st.builds).toHaveLength(1);
    const nikt = sim.st.builds[0].by;
    expect(sim.st.builds[0].by).toBeLessThan(0);
    expect(sim.ileZlecen('budowa')).toBe(1);
    sim.st.builds[0].by = core(sim)[0].id;
    expect(sim.ileZlecen('budowa')).toBe(0);
    sim.st.builds[0].by = nikt;
    expect(sim.ileZlecen('budowa')).toBe(1);
  });

  it('naprawy: otwarte dziury bez łatającego i nienaprawione uszkodzenia w naszych mieszkaniach', () => {
    const sim = newGame(KLUCZ);
    const holes = sim.st.fence!.holes;
    expect(holes.length).toBeGreaterThan(0);
    const uszkodzenia = () =>
      sim.st.damage.filter((d, k) => !d.fixed && sim.st.apts.find((a) => a.apt === d.apt)?.ours && k >= 0).length;
    for (const h of holes) h.patch = 100;
    const tlo = uszkodzenia();
    expect(sim.ileZlecen('naprawy')).toBe(tlo);
    holes[0].patch = 0;
    holes[1].patch = 0;
    expect(sim.ileZlecen('naprawy')).toBe(tlo + 2);
    // jedną dziurę już ktoś łata
    const p = core(sim)[0];
    p.job = prv(sim).newJob('patch', holes[0].id, 0, false);
    expect(sim.ileZlecen('naprawy')).toBe(tlo + 1);
    holes[1].patch = 100;
    expect(sim.ileZlecen('naprawy')).toBe(tlo);
  });

  /** włącza przełącznik „za siatkę” osobie zarządu o danym numerze na liście (polecenie, od następnego kroku) */
  const zaSiatke = (sim: Sim, kto: number): void => {
    sim.push({ t: 'zasiatke', ids: [], osoba: core(sim)[kto].person, on: true });
    sim.step();
  };

  it('drwal: bez przełącznika tylko drzewa na naszym terenie, z przełącznikiem wszystkie wolne', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const s = prv(sim);
    expect(s.zapasDrewna()).toBeLessThan(progi(sim.st).drewno);
    const bez = sim.ileZlecen('drwal');
    zaSiatke(sim, 0);
    const wszystkie = sim.ileZlecen('drwal');
    expect(wszystkie).toBeGreaterThan(bez);
    expect(wszystkie).toBeLessThanOrEqual(w.trees.length);
    // drzewa na naszym terenie, które liczą się przy włączonym przełączniku (ścięcie takiego zabiera dokładnie jedno)
    const naTerenie = [...w.trees.keys()].filter((k) => s.naszTeren(s.trunk[k]));
    const licza = naTerenie.filter((k) => {
      sim.st.felled.push(k);
      const mniej = sim.ileZlecen('drwal') === wszystkie - 1;
      sim.st.felled.pop();
      return mniej;
    });
    expect(licza.length).toBeGreaterThan(0);
    // wyłączenie przełącznika zostawia tylko je
    sim.push({ t: 'zasiatke', ids: [], osoba: core(sim)[0].person, on: false });
    sim.step();
    expect(sim.ileZlecen('drwal')).toBe(licza.length);
    expect(bez).toBe(licza.length);
  });

  it('drwal: ścięte drzewo odejmuje dokładnie jedno zlecenie, na naszym terenie i za siatką', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const s = prv(sim);
    zaSiatke(sim, 0);
    const wolne = sim.ileZlecen('drwal');
    const poza = [...w.trees.keys()].find((k) => k !== s.dry && !s.naszTeren(s.trunk[k]))!;
    sim.st.felled.push(poza);
    expect(sim.ileZlecen('drwal')).toBe(wolne - 1);
    const na = [...w.trees.keys()].find((k) => k !== s.dry && s.naszTeren(s.trunk[k]) && !sim.st.felled.includes(k))!;
    sim.st.felled.push(na);
    expect(sim.ileZlecen('drwal')).toBe(wolne - 2);
    // bez przełącznika ścięcie drzewa za siatką niczego nie zmienia, ścięcie drzewa na terenie zabiera jedno
    sim.push({ t: 'zasiatke', ids: [], osoba: core(sim)[0].person, on: false });
    sim.step();
    const bez = sim.ileZlecen('drwal');
    const drugie = [...w.trees.keys()].find(
      (k) => k !== s.dry && !s.naszTeren(s.trunk[k]) && !sim.st.felled.includes(k),
    )!;
    sim.st.felled.push(drugie);
    expect(sim.ileZlecen('drwal')).toBe(bez);
  });

  it('drwal: przełącznik zmarłej osoby nie liczy się, osoby na wyprawie tak', () => {
    const sim = newGame(KLUCZ);
    const bez = sim.ileZlecen('drwal');
    zaSiatke(sim, 1);
    const z = sim.ileZlecen('drwal');
    expect(z).toBeGreaterThan(bez);
    // na wyprawie dalej należy do zarządu
    core(sim)[1].away = true;
    expect(sim.ileZlecen('drwal')).toBe(z);
    // zginął w tym kroku (jest na cmentarzu, pionek zniknie dopiero na końcu kroku): przełącznik już nie liczy
    (sim as unknown as { graveyard: Set<number> }).graveyard.add(core(sim)[1].id);
    expect(sim.ileZlecen('drwal')).toBe(bez);
    (sim as unknown as { graveyard: Set<number> }).graveyard.clear();
    expect(sim.ileZlecen('drwal')).toBe(z);
    // po śmierci (pionek znika z listy) tak samo
    sim.st.pawns = sim.st.pawns.filter((p) => p !== core(sim)[1]);
    expect(sim.ileZlecen('drwal')).toBe(bez);
  });

  it('drwal: próg zapasu osiągnięty daje zero, także z przełącznikiem; próg 0 wyłącza robienie', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    zaSiatke(sim, 0);
    expect(sim.ileZlecen('drwal')).toBeGreaterThan(0);
    // drewno na podwórku do progu
    const wolny = w.fence.yard.find((i) => !w.blocked[i] && !sim.st.things.some((t) => t.y * w.size + t.x === i))!;
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 5 });
    sim.step();
    const sterta: Thing = {
      id: sim.st.nextThing++,
      kind: 'drewno',
      x: wolny % w.size,
      y: Math.floor(wolny / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 4,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    sim.st.things.push(sterta);
    expect(prv(sim).zapasDrewna()).toBe(4);
    expect(sim.ileZlecen('drwal')).toBeGreaterThan(0);
    sterta.n = 5;
    expect(sim.ileZlecen('drwal')).toBe(0);
    sterta.n = 4;
    expect(sim.ileZlecen('drwal')).toBeGreaterThan(0);
    // próg 0 wyłącza robienie
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 0 });
    sim.step();
    expect(sim.ileZlecen('drwal')).toBe(0);
  });

  /** sterta materiału na kafelku (do liczenia zleceń noszenia) */
  const sterta = (sim: Sim, i: number, kind = 'deski'): Thing => {
    const w = demoWorld(KLUCZ);
    const t: Thing = {
      id: sim.st.nextThing++,
      kind,
      x: i % w.size,
      y: Math.floor(i / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n: 4,
      fuel: 0,
      by: -1,
      owner: -1,
    };
    sim.st.things.push(t);
    return t;
  };

  it('noszenie: sterta na ulicy czeka tylko z przełącznikiem, jedna na stertę', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const s = prv(sim);
    const przed = sim.ileZlecen('noszenie');
    const poza = [...Array(w.size * w.size).keys()].find(
      (i) => !w.blocked[i] && !s.naszTeren(i) && !sim.st.things.some((t) => t.y * w.size + t.x === i),
    );
    expect(poza).toBeDefined();
    const t = sterta(sim, poza!);
    // bez przełącznika nikt po nią nie wyjdzie
    expect(sim.ileZlecen('noszenie')).toBe(przed);
    zaSiatke(sim, 0);
    const z = sim.ileZlecen('noszenie');
    expect(z).toBe(przed + 1);
    // ktoś już ją niesie: nie czeka
    t.by = core(sim)[0].id;
    expect(sim.ileZlecen('noszenie')).toBe(przed);
    // wyłączony przełącznik wraca do stanu sprzed
    t.by = -1;
    sim.push({ t: 'zasiatke', ids: [], osoba: core(sim)[0].person, on: false });
    sim.step();
    expect(sim.ileZlecen('noszenie')).toBe(przed);
  });

  it('noszenie: sterta w budynku za wspólnym płotem (nasz teren, ale nie podwórko) czeka bez przełącznika', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const s = prv(sim);
    const budynek = w.buildings.find((b) => b.id !== w.hq && b.entrances.length)!;
    const wBudynku = [...Array(w.size * w.size).keys()].find((i) => w.bid[i] === budynek.id && !s.insideAt(i));
    expect(wBudynku).toBeDefined();
    const przed = sim.ileZlecen('noszenie');
    sterta(sim, wBudynku!);
    // budynek nie jest jeszcze nasz: bez przełącznika zero
    expect(sim.ileZlecen('noszenie')).toBe(przed);
    sim.st.plot = { bids: [budynek.id] };
    expect(sim.ileZlecen('noszenie')).toBe(przed + 1);
  });

  it('warsztat: zero bez postawionego warsztatu', () => {
    const sim = newGame(KLUCZ);
    expect(sim.st.things.some((t) => t.kind === 'warsztat')).toBe(false);
    expect(sim.ileZlecen('warsztat')).toBe(0);
  });

  it('warsztat: deski do progu liczą się; próg desek 0 albo drewno na progu daje zero', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const wolny = (n: number) =>
      w.fence.yard.filter((i) => !w.blocked[i] && !sim.st.things.some((t) => t.y * w.size + t.x === i))[n];
    const rzecz = (kind: string, i: number, n: number): Thing => ({
      id: sim.st.nextThing++,
      kind,
      x: i % w.size,
      y: Math.floor(i / w.size),
      w: 1,
      h: 1,
      rot: 0,
      n,
      fuel: 0,
      by: -1,
      owner: -1,
    });
    sim.st.things.push(rzecz('warsztat', wolny(0), 1), rzecz('drewno', wolny(1), 40));
    expect(prv(sim).zapasDrewna()).toBe(40);
    // 40 drewna przy progu 30: deski do zrobienia, części i dzidy nie (brak złomu, próg dzid 0)
    expect(sim.ileZlecen('warsztat')).toBe(1);
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 40 });
    sim.step();
    expect(sim.ileZlecen('warsztat')).toBe(0);
    sim.push({ t: 'prog', ids: [], co: 'drewno', n: 30 });
    sim.push({ t: 'prog', ids: [], co: 'deski', n: 0 });
    sim.step();
    expect(sim.ileZlecen('warsztat')).toBe(0);
    sim.push({ t: 'prog', ids: [], co: 'deski', n: 20 });
    sim.step();
    expect(sim.ileZlecen('warsztat')).toBe(1);
  });

  it('ogień i kuchnia: gasnąca koza to jedno zlecenie; kuchnia 0 albo 1', () => {
    const sim = newGame(KLUCZ);
    const koza = sim.st.things.find((t) => t.kind === 'koza')!;
    koza.fuel = 3 * TICKS_PER_HOUR * 20;
    koza.by = -1;
    const sytuacja = sim.ileZlecen('ogien');
    koza.fuel = 10;
    expect(sim.ileZlecen('ogien')).toBe(sytuacja + 1);
    koza.by = core(sim)[0].id;
    expect(sim.ileZlecen('ogien')).toBe(sytuacja);
    expect([0, 1]).toContain(sim.ileZlecen('kuchnia'));
  });

  it('szaber: nieprzeszukane pokoje i wraki; przeszukany pokój przestaje czekać', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const h = houseOf(w)!;
    const przed = sim.ileZlecen('szaber');
    expect(przed).toBeGreaterThan(0);
    const g = sim.st.apts.find((a) => searchable(w, a) && h.rooms.some((r) => r.apt === a.apt))!;
    expect(g).toBeDefined();
    const pokoj = h.rooms.find((r) => r.apt === g.apt)!;
    g.searched.push(pokoj.id);
    expect(sim.ileZlecen('szaber')).toBe(przed - 1);
    // pokój, który ktoś właśnie przeszukuje, też nie czeka
    const inny = h.rooms.find((r) => r.apt === g.apt && !g.searched.includes(r.id));
    if (inny) {
      const p = core(sim)[0];
      p.job = { ...prv(sim).newJob('patch', inny.id, 0, false), t: 'search' };
      expect(sim.ileZlecen('szaber')).toBe(przed - 2);
    }
  });

  it('szaber: pokoje otwartego budynku sąsiada czekają dopiero z przełącznikiem albo gdy budynek jest za naszym płotem', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    sim.lokatorzy = pusto(w);
    const s = sim as unknown as { budynekSasiada(bid: number): number; otworzBudynek(k: number): void };
    // budynek, który po otwarciu ma pokoje do przeszukania (puste mieszkania albo hala)
    const bid = w.buildings.find((b) => {
      if (b.id === w.hq || !b.entrances.length) return false;
      const k = s.budynekSasiada(b.id);
      if (!sim.st.sasiedzi!.budynki[k].otwarty) s.otworzBudynek(k);
      return wnetrze(w, b.id).rooms.some((r) => moznaPrzeszukac(sim.st, w, k, r.id) === 'tak');
    })?.id;
    expect(bid).toBeDefined();
    const k = sim.st.sasiedzi!.budynki.findIndex((b) => b.bid === bid);
    const pokoje = wnetrze(w, bid!).rooms.filter((r) => moznaPrzeszukac(sim.st, w, k, r.id) === 'tak').length;
    expect(pokoje).toBeGreaterThan(0);
    // inne budynki, które test otworzył po drodze, też są poza naszym terenem; liczą się razem z przełącznikiem
    const bez = sim.ileZlecen('szaber');
    zaSiatke(sim, 0);
    const z = sim.ileZlecen('szaber');
    expect(z - bez).toBeGreaterThanOrEqual(pokoje);
    sim.push({ t: 'zasiatke', ids: [], osoba: core(sim)[0].person, on: false });
    sim.step();
    expect(sim.ileZlecen('szaber')).toBe(bez);
    // za wspólnym płotem budynek jest nasz: jego pokoje czekają bez przełącznika
    sim.st.plot = { bids: [bid!] };
    expect(sim.ileZlecen('szaber')).toBe(bez + pokoje);
  });

  it('szaber: wraki na ulicy czekają dopiero z przełącznikiem, pokoje siedziby bez niego', () => {
    const sim = newGame(KLUCZ);
    const w = demoWorld(KLUCZ);
    const bez = sim.ileZlecen('szaber');
    const wraki = wrecksOf(w).filter((wr) => wreckStage(sim.st.wraki, wreckTile(wr, w.size)) === 0);
    expect(wraki.length).toBeGreaterThan(0);
    // pokoje do przeszukania w siedzibie (naszym terenie) liczą się zawsze
    const h = houseOf(w)!;
    const pokoje = h.rooms.filter((r) => {
      const g = r.apt >= 0 ? sim.st.apts.find((a) => a.apt === r.apt) : undefined;
      return g && searchable(w, g) && !g.searched.includes(r.id);
    }).length;
    expect(pokoje).toBeGreaterThan(0);
    expect(bez).toBe(pokoje);
    // pokoje otwartych budynków sąsiadów (poza mieszkaniami lokatorów) też leżą poza naszym terenem
    const sasiedzi = (sim.st.sasiedzi?.budynki ?? []).reduce(
      (n, b, k) =>
        n +
        (b.otwarty ? wnetrze(w, b.bid).rooms.filter((r) => moznaPrzeszukac(sim.st, w, k, r.id) === 'tak').length : 0),
      0,
    );
    zaSiatke(sim, 0);
    expect(sim.ileZlecen('szaber')).toBe(pokoje + sasiedzi + wraki.length);
    // ktoś już przeszukuje jeden wrak: nie czeka
    const t = wreckTile(wraki[0], w.size);
    core(sim)[1].job = { ...prv(sim).newJob('patch', t, 0, false), t: 'wreck' };
    expect(sim.ileZlecen('szaber')).toBe(pokoje + sasiedzi + wraki.length - 1);
  });
});
