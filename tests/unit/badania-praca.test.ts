/* Pracownia, wybór badania i praca zarządu (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Pętla”,
   „Pracownia”, „Kto bada”, „Tempo” i „Stan, polecenia, determinizm”): jedna pracownia na grę, polecenie `research`
   (wybór badania z kartki do wzięcia), polecenie `study` (zarząd przy stole, dwa miejsca), postęp w tickach pracy,
   ukończenie, zmiana badania bez utraty postępu, stanie badania bez wiedzy, rozbiórka pracowni, determinizm, zapis
   i stary zapis bez pól badań. Przymorze z dema, pracownia stawiana od razu jak po finishBuild. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { KOSZT_ERY, kartka, kosztTech, nazwaTech, TECHS, tempoOsoby } from '../../src/sim/badania.ts';
import { BUILDS, type BuildKind, canPlace, footprint } from '../../src/sim/budowle.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { jobText } from '../../src/sim/orders.ts';
import { createSim, type Pawn, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

afterEach(() => ustawJezyk('pl'));

/** gotowa budowla postawiona od razu (jak po finishBuild) w pierwszym miejscu, które canPlace przepuszcza */
function place(st: SimState, kind: BuildKind): Thing {
  const i = allowedAnchors(st, w, kind, 0)[0];
  if (i === undefined) throw new Error(`nie ma miejsca na ${kind}`);
  const f = footprint(kind, 0);
  const t: Thing = {
    id: st.nextThing++,
    kind,
    x: i % w.size,
    y: Math.floor(i / w.size),
    w: f.w,
    h: f.h,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
  };
  st.things.push(t);
  return t;
}

/** gra z pracownią i czterema osobami zarządu: s1 cieplo 3, s2 bud 3 (leniwy), s3 med 2 i uprawa 1, s4 uprawa 2 i bud 1 */
function nowa() {
  const st = createSim(w, seed, { core: 4 });
  const prac = place(st, 'pracownia');
  const sim = new Sim(w, st);
  const ludzie = st.pawns.filter((p) => p.kind === 'core');
  return { st, sim, prac, ludzie };
}

const wybierz = (sim: Sim, tech: string | null) => {
  sim.push({ t: 'research', ids: [], tech });
  sim.step();
};
const siedzi = (p: Pawn) => p.job?.t === 'research' && p.job.phase === 1;
const maPrace = (st: SimState) => st.pawns.filter((p) => p.job?.t === 'research');
/** kroki, aż wszyscy z listy siedzą przy stole */
function usiadz(sim: Sim, ps: Pawn[], max = 2000) {
  for (let k = 0; k < max && !ps.every(siedzi); k++) sim.step();
  expect(ps.every(siedzi)).toBe(true);
}
const kroki = (sim: Sim, n: number) => {
  for (let k = 0; k < n; k++) sim.step();
};
const tempo = (st: SimState, p: Pawn, dom: 'bud' | 'uprawa') => tempoOsoby(st.people[p.person], dom) / TICKS_PER_HOUR;

describe('pracownia: budowla', () => {
  it('ma wymiary, koszt i limit z projektu, a zakładka cuda jest ostatnia', () => {
    expect(BUILDS.pracownia).toMatchObject({
      place: 'pokoj',
      cat: 'dom',
      w: 2,
      h: 1,
      cost: { deski: 16, czesci: 4 },
      work: (3 * TICKS_PER_HOUR) / 2,
      max: 1,
    });
    expect(BUILDS.pracownia.tech).toBeUndefined();
  });

  it('druga pracownia: canPlace odmawia z powodem, przy stojącej i przy planie budowy', () => {
    const st = createSim(w, seed, { core: 4 });
    const kotwice = allowedAnchors(st, w, 'pracownia', 0);
    expect(kotwice.length).toBeGreaterThan(1);
    const [x, y] = [kotwice[0] % w.size, Math.floor(kotwice[0] / w.size)];
    const druga = kotwice[kotwice.length - 1];
    const [x2, y2] = [druga % w.size, Math.floor(druga / w.size)];
    expect(canPlace(st, w, 'pracownia', x2, y2, 0).ok).toBe(true);

    // plan budowy zajmuje limit
    const sim = new Sim(w, st);
    sim.push({ t: 'build', ids: [], kind: 'pracownia', x, y, rot: 0 });
    sim.step();
    expect(st.builds.map((b) => b.kind)).toEqual(['pracownia']);
    const odmowa = canPlace(st, w, 'pracownia', x2, y2, 0);
    expect(odmowa).toEqual({ ok: false, why: 'Pracownia już stoi.' });
    sim.push({ t: 'build', ids: [], kind: 'pracownia', x: x2, y: y2, rot: 0 });
    sim.step();
    expect(st.builds).toHaveLength(1);

    ustawJezyk('en');
    expect(canPlace(st, w, 'pracownia', x2, y2, 0).why).toBe('The research room already stands.');
  });

  it('zwykły plan budowy kończy się stojącą pracownią, a potem można przy niej badać', () => {
    const st = createSim(w, seed, { core: 4 });
    // materiał na podwórku: deski i części z zapasem
    const wolne = w.fence.yard.filter(
      (i) => !st.things.some((t) => t.x === i % w.size && t.y === Math.floor(i / w.size)),
    );
    const stos = (kind: string, n: number, i: number) =>
      st.things.push({
        id: st.nextThing++,
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
    st.things = st.things.filter((t) => t.kind !== 'deski');
    stos('deski', BUILDS.pracownia.cost.deski!, wolne[0]);
    stos('czesci', BUILDS.pracownia.cost.czesci!, wolne[3]);
    const sim = new Sim(w, st);
    const [p] = st.pawns;
    const a = allowedAnchors(st, w, 'pracownia', 0)[0];
    sim.push({ t: 'build', ids: [p.id], kind: 'pracownia', x: a % w.size, y: Math.floor(a / w.size), rot: 0 });
    for (let k = 0; k < 20000 && !st.things.some((t) => t.kind === 'pracownia'); k++) sim.step();
    const prac = st.things.find((t) => t.kind === 'pracownia')!;
    expect(prac).toMatchObject({ x: a % w.size, y: Math.floor(a / w.size), w: 2, h: 1 });
    expect(st.builds).toEqual([]);

    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [p.id], thing: prac.id });
    usiadz(sim, [p]);
    kroki(sim, 30);
    expect(st.research!.prog.t_okna).toBeGreaterThan(0);
  });

  it('druga pracownia: odmowa także przy gotowej, a inne budowle bez limitu nie dostają tego powodu', () => {
    const st = createSim(w, seed, { core: 4 });
    const kotwice = allowedAnchors(st, w, 'pracownia', 0);
    const druga = kotwice[kotwice.length - 1];
    place(st, 'pracownia');
    expect(canPlace(st, w, 'pracownia', druga % w.size, Math.floor(druga / w.size), 0)).toEqual({
      ok: false,
      why: 'Pracownia już stoi.',
    });
    expect(BUILDS.warsztat.max).toBeUndefined();
    const k = allowedAnchors(st, w, 'warsztat', 0)[0];
    expect(canPlace(st, w, 'warsztat', k % w.size, Math.floor(k / w.size), 0).ok).toBe(true);
  });
});

describe('badania: polecenie research', () => {
  it('wybór kartki do wziąć ustawia cur i tworzy research dopiero wtedy; kartka bez wiedzy albo „najpierw” odpada', () => {
    const { st, sim } = nowa();
    // wiedza w budownictwie spada do 1
    st.people[1].skills.bud = 1;
    expect(st.people[1].skills.bud).toBe(1);
    expect('research' in st).toBe(false);

    // kartka „najpierw” (t_spawanie wymaga t_okna) i nieznany identyfikator: nic, i stanu nie ma
    wybierz(sim, 't_spawanie');
    wybierz(sim, 'nie_ma_takiej');
    expect('research' in st).toBe(false);

    wybierz(sim, 't_okna');
    expect(st.research).toEqual({ cur: 't_okna', prog: {}, at: {} });

    // t_okna zbadane, ale wiedza bud 1 < poziom 2: brak wiedzy, cur zostaje
    st.techDone = ['t_okna'];
    st.research!.cur = null;
    expect(kartka(st, 't_spawanie', modeOf(st)).stan).toBe('brak_wiedzy');
    wybierz(sim, 't_spawanie');
    expect(st.research!.cur).toBeNull();

    // wiedza wraca: t_spawanie do wzięcia
    st.people[1].skills.bud = 3;
    wybierz(sim, 't_spawanie');
    expect(st.research!.cur).toBe('t_spawanie');
  });

  it('zbadana kartka odpada, tech: null zdejmuje wybór bez kasowania postępu i kończy prace', () => {
    const { st, sim, prac, ludzie } = nowa();
    wybierz(sim, 't_okna');
    st.research!.prog.t_okna = 3;
    sim.push({ t: 'study', ids: [ludzie[1].id], thing: prac.id });
    usiadz(sim, [ludzie[1]]);
    wybierz(sim, null);
    expect(st.research!.cur).toBeNull();
    expect(st.research!.prog.t_okna).toBeGreaterThanOrEqual(3);
    expect(maPrace(st)).toEqual([]);

    st.techDone = ['t_okna'];
    wybierz(sim, 't_okna');
    expect(st.research!.cur).toBeNull();
  });

  it('wybór nie wymaga zaznaczonych: ids puste wystarczy', () => {
    const { st, sim } = nowa();
    sim.push({ t: 'research', ids: [], tech: 't_konserwy' });
    sim.step();
    expect(st.research!.cur).toBe('t_konserwy');
  });
});

describe('badania: praca zarządu przy stole', () => {
  it('„Badać”: po dojściu postęp rośnie o tempo osoby na tick, po przekroczeniu kosztu badanie się kończy', () => {
    const { st, sim, prac, ludzie } = nowa();
    const p = ludzie[1];
    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [p.id], thing: prac.id });
    sim.step();
    expect(p.job?.t).toBe('research');
    usiadz(sim, [p]);
    expect(p.job!.target).toBe(prac.id);
    expect(p.job!.order).toBe(true);

    const na = tempo(st, p, 'bud');
    const p0 = st.research!.prog.t_okna ?? 0;
    kroki(sim, 50);
    expect(siedzi(p)).toBe(true);
    expect(st.research!.prog.t_okna - p0).toBeCloseTo(50 * na, 9);

    // jeszcze półtora ticku do końca
    st.research!.prog.t_okna = kosztTech('t_okna') - 1.5 * na;
    sim.step();
    expect(st.techDone).toBeUndefined();
    expect(st.research!.cur).toBe('t_okna');
    const przed = st.tick;
    sim.step();
    sim.step();
    expect(st.techDone).toEqual(['t_okna']);
    expect(st.research!.cur).toBeNull();
    expect(st.research!.prog.t_okna).toBeGreaterThanOrEqual(kosztTech('t_okna'));
    expect(st.research!.at.t_okna).toBeGreaterThanOrEqual(przed);
    expect(st.research!.at.t_okna).toBeLessThan(st.tick);
    expect(maPrace(st)).toEqual([]);
    expect(p.job?.t).not.toBe('research');
    expect(kartka(st, 't_okna', modeOf(st)).stan).toBe('zbadana');
  });

  it('koszt ułamkowy (mnożnik ery): badanie kończy się dopiero przy postępie nie mniejszym niż koszt, bez zaokrągleń', () => {
    const era1 = KOSZT_ERY[1];
    (KOSZT_ERY as Record<number, number>)[1] = 1.1;
    try {
      const koszt = kosztTech('t_okna');
      expect(koszt).toBeCloseTo(13.2, 9);
      const { st, sim, prac, ludzie } = nowa();
      const p = ludzie[1];
      wybierz(sim, 't_okna');
      sim.push({ t: 'study', ids: [p.id], thing: prac.id });
      usiadz(sim, [p]);
      const na = tempo(st, p, 'bud');
      // po zaokrągleniu kosztu do 13 byłoby już po wszystkim
      st.research!.prog.t_okna = 13.1;
      sim.step();
      expect(st.research!.cur).toBe('t_okna');
      expect(st.techDone).toBeUndefined();
      st.research!.prog.t_okna = koszt - na / 2;
      sim.step();
      expect(st.techDone).toEqual(['t_okna']);
      expect(st.research!.prog.t_okna).toBeGreaterThanOrEqual(koszt);
    } finally {
      (KOSZT_ERY as Record<number, number>)[1] = era1;
    }
  });

  it('dwie osoby przy stole dają dwa razy szybszy postęp, trzecia nie dostaje miejsca', () => {
    // s1 i s3 nie mają budownictwa ani cech tempa: ten sam krok na tick
    const postep = (ids: number[]) => {
      const { st, sim, prac, ludzie } = nowa();
      const ps = ids.map((i) => ludzie[i]);
      wybierz(sim, 't_okna');
      sim.push({ t: 'study', ids: ps.map((p) => p.id), thing: prac.id });
      usiadz(sim, ps);
      const p0 = st.research!.prog.t_okna ?? 0;
      kroki(sim, 40);
      expect(ps.every(siedzi)).toBe(true);
      return { st, sim, prac, ludzie, ps, d: st.research!.prog.t_okna - p0 };
    };
    const jedna = postep([0]);
    const dwie = postep([0, 2]);
    expect(jedna.d).toBeCloseTo(40 * tempo(jedna.st, jedna.ps[0], 'bud'), 9);
    expect(dwie.d).toBeCloseTo(2 * jedna.d, 9);

    // dwa różne kafelki, jedna osoba na kafelek
    expect(dwie.ps[0].job!.tile).not.toBe(dwie.ps[1].job!.tile);
    // trzecia (s2) miejsca nie dostaje: ani polecenie, ani startResearch
    const trzecia = dwie.ludzie[1];
    dwie.sim.push({ t: 'study', ids: [trzecia.id], thing: dwie.prac.id });
    dwie.sim.step();
    expect(dwie.sim.startResearch(trzecia, true)).toBe(false);
    expect(
      maPrace(dwie.st)
        .map((q) => q.id)
        .sort(),
    ).toEqual([dwie.ludzie[0].id, dwie.ludzie[2].id].sort());
  });

  it('polecenie z trzema osobami: dwie siadają, trzecia zostaje przy swoim', () => {
    const { st, sim, prac, ludzie } = nowa();
    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [ludzie[0].id, ludzie[1].id, ludzie[2].id], thing: prac.id });
    sim.step();
    expect(maPrace(st)).toHaveLength(2);
    expect(ludzie[2].job?.t).not.toBe('research');
  });

  it('koniec badania podnosi z miejsc wszystkich siedzących', () => {
    const { st, sim, prac, ludzie } = nowa();
    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [ludzie[0].id, ludzie[2].id], thing: prac.id });
    usiadz(sim, [ludzie[0], ludzie[2]]);
    st.research!.prog.t_okna = kosztTech('t_okna') - 0.0001;
    sim.step();
    expect(st.techDone).toEqual(['t_okna']);
    expect(maPrace(st)).toEqual([]);
  });

  it('zmiana badania w połowie nie kasuje postępu, powrót go podejmuje; siedzący zostaje przy stole', () => {
    const { st, sim, prac, ludzie } = nowa();
    const p = ludzie[3]; // s4: uprawa 2, bud 1
    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [p.id], thing: prac.id });
    usiadz(sim, [p]);
    kroki(sim, 60);
    const okna = st.research!.prog.t_okna;
    expect(okna).toBeGreaterThan(0);

    wybierz(sim, 't_konserwy');
    expect(st.research!.cur).toBe('t_konserwy');
    expect(st.research!.prog.t_okna).toBe(okna);
    expect(siedzi(p)).toBe(true);
    kroki(sim, 60);
    expect(st.research!.prog.t_okna).toBe(okna);
    const konserwy = st.research!.prog.t_konserwy;
    expect(konserwy).toBeGreaterThan(0);
    // tempo według dziedziny nowego badania: uprawa
    expect(konserwy).toBeCloseTo(61 * tempo(st, p, 'uprawa'), 9);

    // krok z powrotem wybranym t_okna dodaje już jemu jeden tick, a t_konserwy stoi
    wybierz(sim, 't_okna');
    expect(st.research!.prog.t_okna).toBeCloseTo(okna + tempo(st, p, 'bud'), 12);
    expect(st.research!.prog.t_konserwy).toBe(konserwy);
    kroki(sim, 60);
    expect(st.research!.prog.t_konserwy).toBe(konserwy);
    expect(st.research!.prog.t_okna).toBeCloseTo(okna + 61 * tempo(st, p, 'bud'), 9);
  });

  it('wiedza spada (jedyny fachowiec poza osadą): badanie stoi, postęp nie rośnie, po powrocie rośnie', () => {
    const { st, sim, prac, ludzie } = nowa();
    // uprawa tylko u s3
    for (const q of st.people) delete q.skills.uprawa;
    st.people[2].skills.uprawa = 1;
    const [, , s3, s4] = ludzie;
    wybierz(sim, 't_konserwy');
    sim.push({ t: 'study', ids: [s4.id], thing: prac.id });
    usiadz(sim, [s4]);
    kroki(sim, 20);
    const razem = st.research!.prog.t_konserwy;
    expect(razem).toBeGreaterThan(0);

    s3.away = true;
    sim.step();
    expect(kartka(st, 't_konserwy', modeOf(st)).stan).toBe('stoi');
    kroki(sim, 100);
    expect(st.research!.prog.t_konserwy).toBeCloseTo(razem, 12);
    expect(siedzi(s4)).toBe(true);
    expect(st.research!.cur).toBe('t_konserwy');

    s3.away = false;
    sim.step();
    kroki(sim, 20);
    expect(st.research!.prog.t_konserwy).toBeGreaterThan(razem);
  });

  it('rozbiórka pracowni kończy prace, a postęp, wybór i zbadane zostają', () => {
    const { st, sim, prac, ludzie } = nowa();
    wybierz(sim, 't_okna');
    st.techDone = ['t_inna'];
    sim.push({ t: 'study', ids: [ludzie[1].id, ludzie[3].id], thing: prac.id });
    // jeden jeszcze idzie, drugi już siedzi
    usiadz(sim, [ludzie[1]]);
    kroki(sim, 30);
    const prog = { ...st.research!.prog };
    expect(prog.t_okna).toBeGreaterThan(0);

    sim.push({ t: 'unbuild', ids: [], id: prac.id });
    sim.step();
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(false);
    expect(maPrace(st)).toEqual([]);
    expect(st.research!.prog).toEqual(prog);
    expect(st.research!.cur).toBe('t_okna');
    expect(st.techDone).toEqual(['t_inna']);
    kroki(sim, 200);
    expect(st.research!.prog).toEqual(prog);
    expect(maPrace(st)).toEqual([]);
    expect(sim.startResearch(ludzie[1], true)).toBe(false);
  });

  it('rozbiórka pracowni zawraca też tego, kto jeszcze idzie do stołu', () => {
    const { st, sim, prac, ludzie } = nowa();
    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [ludzie[1].id], thing: prac.id });
    sim.step();
    expect(ludzie[1].job?.t).toBe('research');
    expect(ludzie[1].job?.phase).toBe(0);
    sim.push({ t: 'unbuild', ids: [], id: prac.id });
    sim.step();
    expect(maPrace(st)).toEqual([]);
    kroki(sim, 300);
    expect(maPrace(st)).toEqual([]);
    expect(st.research!.prog.t_okna ?? 0).toBe(0);
  });

  it('praca bez polecenia ustępuje nocy jak inne prace M2, z poleceniem nie', () => {
    const noc = (order: boolean) => {
      const { st, sim, prac, ludzie } = nowa();
      st.tick = Math.round((23 - 15) * TICKS_PER_HOUR);
      wybierz(sim, 't_okna');
      const p = ludzie[0];
      expect(sim.startResearch(p, order)).toBe(true);
      expect(p.job!.order).toBe(order);
      expect(p.job!.target).toBe(prac.id);
      kroki(sim, 400);
      return siedzi(p);
    };
    expect(noc(true)).toBe(true);
    expect(noc(false)).toBe(false);
  });

  it('startResearch odmawia bez wybranego badania, bez pracowni i dla nieobecnego, a stanu nie tworzy', () => {
    const { st, sim, ludzie } = nowa();
    expect(sim.startResearch(ludzie[0])).toBe(false);
    expect('research' in st).toBe(false);
    wybierz(sim, 't_okna');
    ludzie[0].away = true;
    expect(sim.startResearch(ludzie[0])).toBe(false);
    ludzie[0].away = false;
    expect(sim.startResearch(ludzie[0])).toBe(true);

    const bez = createSim(w, seed, { core: 2 });
    bez.research = { cur: 't_okna', prog: {}, at: {} };
    const sim2 = new Sim(w, bez);
    expect(sim2.startResearch(bez.pawns[0])).toBe(false);
  });

  it('polecenie study do rzeczy, która nie jest pracownią, nic nie robi', () => {
    const { st, sim, ludzie } = nowa();
    wybierz(sim, 't_okna');
    const inna = st.things.find((t) => t.kind === 'koza')!;
    sim.push({ t: 'study', ids: [ludzie[0].id], thing: inna.id });
    sim.push({ t: 'study', ids: [ludzie[0].id], thing: 99999 });
    kroki(sim, 5);
    expect(maPrace(st)).toEqual([]);
  });

  it('badanie spoza drzewka (stary zapis) nie zatrzymuje gry i nikt przy nim nie siada', () => {
    const { st, sim, prac, ludzie } = nowa();
    st.research = { cur: 't_nie_ma', prog: {}, at: {} };
    expect(sim.startResearch(ludzie[0], true)).toBe(false);
    sim.push({ t: 'study', ids: [ludzie[0].id], thing: prac.id });
    kroki(sim, 300);
    expect(maPrace(st)).toEqual([]);
    expect(st.research.prog).toEqual({});
  });

  it('opis pracy: „Bada: <nazwa> (14 / 25)” po polsku i po angielsku, w drodze „idzie”', () => {
    const { st, sim, prac, ludzie } = nowa();
    const p = ludzie[1];
    wybierz(sim, 't_okna');
    sim.push({ t: 'study', ids: [p.id], thing: prac.id });
    sim.step();
    expect(jobText(st, w, p)).toBe('Idzie do pracowni.');
    usiadz(sim, [p]);
    st.research!.prog.t_okna = 3.7;
    const nazwa = nazwaTech('t_okna');
    expect(jobText(st, w, p)).toBe(`Bada: ${nazwa.pl} (3 / 12)`);
    ustawJezyk('en');
    expect(jobText(st, w, p)).toBe(`Researching: ${nazwa.en} (3 / 12)`);
    ustawJezyk('pl');
    // koszt ułamkowy (era 3 ×1,5) z przecinkiem po polsku
    const era3 = TECHS.find((t) => t.era === 3 && kosztTech(t.id) % 1 !== 0)!;
    st.research!.cur = era3.id;
    st.research!.prog[era3.id] = 14;
    expect(jobText(st, w, p)).toBe(
      `Bada: ${tr(nazwaTech(era3.id))} (14 / ${String(kosztTech(era3.id)).replace('.', ',')})`,
    );
  });
});

describe('badania: determinizm i zapis', () => {
  /** Sterownik: co 200 ticków zarząd ma ciepło, jedzenie i siły z zapasem (bez opału w tej grze zmarzliby i wstali od
      stołu), co tysiąc ticków s2 i s4 siadają do pracowni, a gdy nic nie jest wybrane, sterownik wybiera pierwszą
      kartkę do wzięcia. */
  const sterownik = (sim: Sim, k: number, ids: number[], thing: number) => {
    const st = sim.st;
    if (k % 200 === 0)
      for (const p of st.pawns)
        if (p.needs) {
          p.needs.warm = Math.max(p.needs.warm, 60);
          p.needs.food = Math.max(p.needs.food, 60);
          p.needs.rest = Math.max(p.needs.rest, 60);
        }
    if (k % 1000 !== 0) return;
    if (!st.research?.cur) {
      const t = TECHS.find((x) => kartka(st, x.id, modeOf(st)).stan === 'do_wziecia');
      if (t) sim.push({ t: 'research', ids: [], tech: t.id });
    }
    sim.push({ t: 'study', ids, thing });
  };
  const DWIE_DOBY = 2 * 24 * TICKS_PER_HOUR;

  function przebieg(do_: number, zapiszW?: number) {
    const { st, sim: s0, prac, ludzie } = nowa();
    const ids = [ludzie[1].id, ludzie[3].id];
    let sim = s0;
    for (let k = 0; k < do_; k++) {
      if (k === zapiszW) sim = new Sim(w, JSON.parse(JSON.stringify(sim.st)) as SimState);
      sterownik(sim, k, ids, prac.id);
      sim.step();
    }
    return { sim, st: sim.st, orig: st };
  }

  it('ten sam skrót po dwóch dobach badania z tym samym ziarnem, a badania naprawdę idą', () => {
    const a = przebieg(DWIE_DOBY);
    const b = przebieg(DWIE_DOBY);
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(a.st.techDone?.length ?? 0).toBeGreaterThan(0);
    expect(Object.keys(a.st.research!.prog).length).toBeGreaterThan(0);
  });

  it('zapis i wczytanie w połowie badania nie zmieniają przebiegu', () => {
    const prosto = przebieg(DWIE_DOBY);
    // 19777 to nie granica doby ani wielokrotność tysiąca: w stanie nie ma poleceń w kolejce
    const zZapisem = przebieg(DWIE_DOBY, 19777);
    expect(zZapisem.sim).not.toBe(prosto.sim);
    expect(zZapisem.sim.hash()).toBe(prosto.sim.hash());
  });

  it('stan bez research, books i techDone przechodzi dobę bez wyjątku i bez tych pól', () => {
    const { st, sim } = nowa();
    const stary = JSON.parse(JSON.stringify(st)) as Record<string, unknown>;
    delete stary.research;
    delete stary.books;
    delete stary.techDone;
    const gra = new Sim(w, stary as unknown as SimState);
    kroki(gra, 24 * TICKS_PER_HOUR);
    for (const pole of ['research', 'books', 'techDone']) expect(pole in gra.st).toBe(false);
    for (const p of gra.st.pawns.filter((q) => q.kind === 'core')) expect(gra.startResearch(p)).toBe(false);
    expect('research' in gra.st).toBe(false);
    expect(sim.st).not.toBe(gra.st);
  });
});
