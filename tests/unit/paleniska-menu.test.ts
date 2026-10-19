/* Menu pod prawym przyciskiem na nowych paleniskach (koza z beczki, kocioł) i drewno w ogniu w odczycie
   (`snapshot().stock.wood`): „Dołożyć” działa jak przy kozie zarządu (polecenie `refuel`, domyślne po kliknięciu, tylko gdy
   jest skąd wziąć drewno; po angielsku „Feed the barrel stove” i „Feed the boiler” według słowniczka), potwierdzenie po
   poleceniu i opis pracy mówią, do którego paleniska idzie, a zapas drewna w odczycie liczy ogień wszystkich palenisk
   naszych mieszkań, żeby karta nocy nie zaniżała zapasu. Przymorze z createSim, rzeczy dokładane ręcznie. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandFor, commandsAt, jobText, refuelFeedback } from '../../src/sim/orders.ts';
import { BURN_TICKS, createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { statsOf } from '../../src/ui/pasek.ts';
import { buildWorld } from '../../src/world/world.ts';

const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const seed = Number.parseInt(hashString(d.addr), 16) || 2051;
const w = buildWorld(d.geo, { seed, street: d.street });

afterEach(() => ustawJezyk('pl'));

const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core');

/** rzecz postawiona od razu, jak po finishBuild; wolne miejsce na pierwszych kafelkach podwórka */
function postaw(st: SimState, kind: string, x: number, y: number, o: Partial<Thing> = {}): Thing {
  const t: Thing = {
    id: st.nextThing++,
    kind,
    x,
    y,
    w: kind === 'kociol' ? 2 : 1,
    h: 1,
    rot: 0,
    n: 0,
    fuel: 0,
    by: -1,
    owner: -1,
    ...o,
  };
  st.things.push(t);
  return t;
}

/** stan z zarządem, bez drewna w składzie, z dwoma stosami na podwórku (jest skąd wziąć) albo bez nich */
function stan(zDrewnem: boolean) {
  const st = createSim(w, seed, { core: 2 });
  st.things = st.things.filter((t) => t.kind !== 'drewno');
  const out = w.buildings[w.hq].entrances[0].out;
  const x0 = out % w.size;
  const y0 = Math.floor(out / w.size);
  if (zDrewnem) {
    // dwa stosy, żeby dwie osoby naraz miały skąd wziąć
    postaw(st, 'drewno', x0 + 3, y0 + 3, { n: 4 });
    postaw(st, 'drewno', x0 + 4, y0 + 3, { n: 4 });
  }
  return { st, x0, y0, ids: rdzen(st).map((p) => p.id) };
}
const tile = (x: number, y: number) => y * w.size + x;
const etykiety = (st: SimState, ids: number[], t: number) => commandsAt(st, w, ids, t).map((m) => m.label);

describe('menu: Dołożyć na nowych paleniskach', () => {
  it('koza z beczki: „Dołożyć do kozy z beczki” jako domyślne polecenie, gdy jest drewno, polecenie refuel', () => {
    const { st, x0, y0, ids } = stan(true);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4);
    const t = tile(beczka.x, beczka.y);
    const pozycja = commandsAt(st, w, ids, t).find((m) => m.cmd.t === 'refuel')!;
    expect(pozycja).toMatchObject({ label: 'Dołożyć do kozy z beczki', quick: true });
    expect(pozycja.cmd).toEqual({ t: 'refuel', ids, thing: beczka.id });
    expect(pozycja.off).toBeUndefined();
    // „Idź tu” zostaje na końcu, a kliknięcie bez menu to to samo polecenie
    expect(etykiety(st, ids, t).at(-1)).toBe('Idź tu');
    expect(commandFor(st, w, ids, t)).toEqual({ t: 'refuel', ids, thing: beczka.id });
  });

  it('kocioł 2×1: „Dołożyć do kotła” na obu kafelkach podstawy', () => {
    const { st, x0, y0, ids } = stan(true);
    const kociol = postaw(st, 'kociol', x0 + 6, y0 + 4);
    for (const dx of [0, 1]) {
      const m = commandsAt(st, w, ids, tile(kociol.x + dx, kociol.y)).find((q) => q.cmd.t === 'refuel')!;
      expect(m.label).toBe('Dołożyć do kotła');
      expect(m.cmd).toEqual({ t: 'refuel', ids, thing: kociol.id });
      expect(m.quick).toBe(true);
    }
    // za podstawą nie ma już tej pozycji
    expect(commandsAt(st, w, ids, tile(kociol.x + 2, kociol.y)).some((q) => q.cmd.t === 'refuel')).toBe(false);
  });

  it('bez drewna do wzięcia nie ma pozycji (jak przy kozie zarządu), drewno w rękach wystarcza', () => {
    const { st, x0, y0, ids } = stan(false);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4);
    const kociol = postaw(st, 'kociol', x0 + 8, y0 + 4);
    const bez = (t: Thing) => commandsAt(st, w, ids, tile(t.x, t.y)).some((m) => m.cmd.t === 'refuel');
    expect(bez(beczka)).toBe(false);
    expect(bez(kociol)).toBe(false);
    expect(commandFor(st, w, ids, tile(beczka.x, beczka.y))).toEqual({ t: 'move', ids, to: tile(beczka.x, beczka.y) });
    rdzen(st)[0].carry = 2;
    expect(bez(beczka)).toBe(true);
    expect(bez(kociol)).toBe(true);
  });

  it('bez zaznaczonego zarządu menu jest puste, na zimnej beczce też jest „Dołożyć” (zimna to właśnie czas dokładać)', () => {
    const { st, x0, y0, ids } = stan(true);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4, { fuel: 0 });
    expect(commandsAt(st, w, [], tile(beczka.x, beczka.y))).toEqual([]);
    expect(commandsAt(st, w, ids, tile(beczka.x, beczka.y)).some((m) => m.cmd.t === 'refuel')).toBe(true);
  });

  it('po angielsku', () => {
    const { st, x0, y0, ids } = stan(true);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4);
    const kociol = postaw(st, 'kociol', x0 + 8, y0 + 4);
    ustawJezyk('en');
    // według słowniczka EN: „Feed the stove” przy kozie zarządu, więc „Feed the …” także tu
    expect(etykiety(st, ids, tile(beczka.x, beczka.y))).toContain('Feed the barrel stove');
    expect(etykiety(st, ids, tile(kociol.x, kociol.y))).toContain('Feed the boiler');
  });

  it('potwierdzenie po poleceniu mówi, do którego paleniska dołoży (jedna osoba i kilka, oba języki)', () => {
    const { st, x0, y0 } = stan(true);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4);
    const kociol = postaw(st, 'kociol', x0 + 8, y0 + 4);
    const koza = st.things.find((t) => t.kind === 'koza')!;
    expect([0, 1].map((k) => refuelFeedback(st, beczka.id, k))).toEqual([
      'Dołoży do kozy z beczki.',
      'Dołożą do kozy z beczki.',
    ]);
    expect([0, 1].map((k) => refuelFeedback(st, kociol.id, k))).toEqual(['Dołoży do kotła.', 'Dołożą do kotła.']);
    // koza zarządu, ognisko i nieznana rzecz: ogólne potwierdzenie z main.ts (null)
    expect(refuelFeedback(st, koza.id, 0)).toBeNull();
    expect(refuelFeedback(st, 99999, 0)).toBeNull();
    ustawJezyk('en');
    expect([0, 1].map((k) => refuelFeedback(st, beczka.id, k))).toEqual([
      'Off to feed the barrel stove.',
      'Off to feed the barrel stove.',
    ]);
    expect(refuelFeedback(st, kociol.id, 1)).toBe('Off to feed the boiler.');
  });

  it('opis pracy: do którego paleniska idzie i dokłada', () => {
    const { st, x0, y0 } = stan(true);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4);
    const kociol = postaw(st, 'kociol', x0 + 8, y0 + 4);
    const sim = new Sim(w, st);
    const [a, b] = rdzen(st);
    sim.push({ t: 'refuel', ids: [a.id], thing: beczka.id });
    sim.push({ t: 'refuel', ids: [b.id], thing: kociol.id });
    sim.step();
    expect([a.job?.t, a.job?.phase, b.job?.t, b.job?.phase]).toEqual(['refuel', 0, 'refuel', 0]);
    expect(jobText(st, w, a)).toBe('Idzie po drewno do kozy z beczki.');
    expect(jobText(st, w, b)).toBe('Idzie po drewno do kotła.');
    ustawJezyk('en');
    expect(jobText(st, w, a)).toBe('Fetching wood for the barrel stove.');
    expect(jobText(st, w, b)).toBe('Fetching wood for the boiler.');
    ustawJezyk('pl');
    // po drodze (faza 1) dokłada
    a.job!.phase = 1;
    b.job!.phase = 1;
    expect(jobText(st, w, a)).toBe('Dokłada do kozy z beczki.');
    expect(jobText(st, w, b)).toBe('Dokłada do kotła.');
    ustawJezyk('en');
    expect(jobText(st, w, a)).toBe('Feeding the barrel stove.');
    expect(jobText(st, w, b)).toBe('Feeding the boiler.');
  });

  it('dokładanie z menu naprawdę napełnia nowe paleniska (polecenie działa jak przy kozie zarządu)', () => {
    const { st, x0, y0 } = stan(true);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4);
    const sim = new Sim(w, st);
    const [a] = rdzen(st);
    sim.push({ t: 'refuel', ids: [a.id], thing: beczka.id });
    for (let k = 0; k < 2400 && beczka.fuel === 0; k++) sim.step();
    expect(beczka.fuel).toBeGreaterThan(0);
  });
});

describe('snapshot().stock.wood: drewno w ogniu wszystkich palenisk', () => {
  const drewno = (st: SimState) => snapshot(st, w).stock.wood;

  it('liczy koza zarządu, koza z beczki i kocioł (sztuki w ogniu, zaokrąglone w górę)', () => {
    const { st, x0, y0 } = stan(false);
    const koza = st.things.find((t) => t.kind === 'koza')!;
    koza.fuel = 0;
    expect(drewno(st)).toBe(0);
    koza.fuel = 2 * BURN_TICKS;
    expect(drewno(st)).toBe(2);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4, { fuel: 3 * BURN_TICKS - 5 });
    expect(drewno(st)).toBe(2 + 3);
    const kociol = postaw(st, 'kociol', x0 + 8, y0 + 4, { fuel: 4 * BURN_TICKS });
    // kocioł pali trzy razy szybciej, ale zbiornik trzyma sztuki jak koza: 4 sztuki w ogniu to 4 sztuki drewna
    expect(drewno(st)).toBe(2 + 3 + 4);
    // luzem, w składzie i w rękach liczy się jak dawniej, razem z ogniem
    postaw(st, 'drewno', x0 + 3, y0 + 3, { n: 5 });
    rdzen(st)[0].carry = 2;
    expect(drewno(st)).toBe(2 + 3 + 4 + 5 + 2);
    beczka.fuel = 0;
    kociol.fuel = 0;
    expect(drewno(st)).toBe(2 + 5 + 2);
  });

  it('same nowe paleniska bez kozy zarządu też się liczą, a godziny ognia (fireHours) dalej tylko kozy zarządu', () => {
    const { st, x0, y0 } = stan(false);
    st.things = st.things.filter((t) => t.kind !== 'koza');
    postaw(st, 'koza_beczka', x0 + 6, y0 + 4, { fuel: BURN_TICKS });
    const s = snapshot(st, w);
    expect(s.stock.wood).toBe(1);
    expect(s.stock.fireHours).toBe(0);
    // ale kuchnia jest ogrzana: dla karty nocy i raportu rano pali się, choć koza zarządu nie
    expect(s.kozaLit).toBe(true);
  });

  it('kozaLit jest prawdą, gdy pali się którekolwiek palenisko: koza zarządu, koza z beczki albo kocioł', () => {
    const { st, x0, y0 } = stan(false);
    const koza = st.things.find((t) => t.kind === 'koza')!;
    koza.fuel = 0;
    expect(snapshot(st, w).kozaLit).toBe(false);
    const beczka = postaw(st, 'koza_beczka', x0 + 6, y0 + 4, { fuel: 0 });
    const kociol = postaw(st, 'kociol', x0 + 8, y0 + 4, { fuel: 0 });
    // zimne nowe paleniska nie zmieniają nic
    expect(snapshot(st, w).kozaLit).toBe(false);
    beczka.fuel = 1;
    expect(snapshot(st, w).kozaLit).toBe(true);
    beczka.fuel = 0;
    kociol.fuel = 1;
    expect(snapshot(st, w).kozaLit).toBe(true);
    kociol.fuel = 0;
    koza.fuel = 1;
    expect(snapshot(st, w).kozaLit).toBe(true);
    // gra z samą kozą zarządu: dokładnie jak dawniej (ogień > 0)
    st.things = st.things.filter((t) => t.kind !== 'koza_beczka' && t.kind !== 'kociol');
    expect(snapshot(st, w).kozaLit).toBe(true);
    koza.fuel = 0;
    expect(snapshot(st, w).kozaLit).toBe(false);
  });

  it('govInput i karta nocy widzą palący się kocioł jako ogrzaną kuchnię (kozaLit), a pasek mówi dalej o samej kozie', () => {
    const { st, x0, y0 } = stan(false);
    st.things.find((t) => t.kind === 'koza')!.fuel = 0;
    postaw(st, 'kociol', x0 + 8, y0 + 4, { fuel: 3 * BURN_TICKS });
    const s = snapshot(st, w);
    expect(s.kozaLit).toBe(true);
    expect(govInput(st, w, 0).kozaLit).toBe(true);
    const sFire = statsOf(s, null).find((x) => x.id === 'sFire')!;
    expect(sFire.value).toBe('zimna');
    expect(sFire.title).toContain('Koza zimna');
  });

  it('gra bez nowych palenisk: to samo drewno co dawniej (ogień kozy zarządu w górę)', () => {
    const { st } = stan(false);
    const koza = st.things.find((t) => t.kind === 'koza')!;
    for (const fuel of [0, 1, BURN_TICKS - 1, BURN_TICKS, BURN_TICKS + 1, 5 * BURN_TICKS + 7]) {
      koza.fuel = fuel;
      expect(drewno(st)).toBe(Math.ceil(fuel / BURN_TICKS));
    }
  });
});
