/* Odczyt badań dla warunków zwycięstwa i „Włączenie sieci” (kontrakt z projektem warunków zwycięstwa, nocny
   integrator 19.10.2026): `GovInput.badania` ma kształt { pracownia, zbadane, era, koncowa, siecWlaczona }, gdzie
   `koncowa` to zbadana fabryka bieżącego trybu (sama sieć nią nie jest), polecenie `siec` włącza sieć po zbadaniu samej
   sieci (t_siec, jeszcze przed fabryką) przy stojącej pracowni (pole stanu powstaje dopiero przy włączeniu, drugie
   włączenie nic nie zmienia), a menu pracowni ma pozycję „Włączyć sieć” tylko do włączenia. Przymorze z dema. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { siecWlaczona } from '../../src/sim/badania.ts';
import { type BuildKind, footprint } from '../../src/sim/budowle.ts';
import { govInput } from '../../src/sim/gov.ts';
import { commandsAt } from '../../src/sim/orders.ts';
import { createSim, Sim, type SimState, type Thing } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { siecSheet } from '../../src/ui/okna.ts';
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

/** świeża gra (domyślnie zwykła); pracownia i zbadane technologie dopiero na życzenie (pola powstają przy pierwszym
    użyciu) */
function gra(opts: { pracownia?: boolean; techDone?: string[]; mode?: GameMode } = {}) {
  const st = createSim(w, seed, { core: 4, mode: opts.mode });
  const prac = opts.pracownia ? place(st, 'pracownia') : undefined;
  if (opts.techDone) st.techDone = [...opts.techDone];
  return { st, sim: new Sim(w, st), prac };
}

const badania = (st: SimState) => govInput(st, w, 0).badania;
const siec = (sim: Sim) => {
  sim.push({ t: 'siec', ids: [] });
  sim.step();
};
const rdzen = (st: SimState) => st.pawns.filter((p) => p.kind === 'core').map((p) => p.id);
const pozycja = (st: SimState, tile: number) => commandsAt(st, w, rdzen(st), tile).find((m) => m.cmd.t === 'siec');
const kafel = (t: Thing) => t.y * w.size + t.x;

describe('odczyt badań dla zarządu: kształt GovInput.badania', () => {
  it('świeży stan: nic, bez pracowni, bez sieci', () => {
    const { st } = gra();
    expect(badania(st)).toEqual({ pracownia: false, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false });
  });

  it('po postawieniu pracowni pracownia: true, reszta bez zmian', () => {
    const { st } = gra({ pracownia: true });
    expect(badania(st)).toEqual({ pracownia: true, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false });
  });

  it('po zbadaniu t_okna i t_spawanie: dwie technologie, era 2', () => {
    const { st } = gra({ pracownia: true, techDone: ['t_okna', 't_spawanie'] });
    expect(badania(st)).toEqual({ pracownia: true, zbadane: 2, era: 2, koncowa: false, siecWlaczona: false });
  });

  it('identyfikator spoza drzewka (t_test) w techDone się nie liczy: ani do zbadanych, ani do ery', () => {
    const { st } = gra({ techDone: ['t_okna', 't_test'] });
    expect(badania(st)).toMatchObject({ zbadane: 1, era: 1, koncowa: false });
    const sam = gra({ techDone: ['t_test'] }).st;
    expect(badania(sam)).toMatchObject({ zbadane: 0, era: 0 });
  });

  it('sama sieć zbadana: era 6, ale koncowa false (celem jest fabryka), sieć jeszcze nie włączona', () => {
    for (const mode of ['zwykly', 'zombie'] as const) {
      const { st } = gra({ pracownia: true, techDone: ['t_siec'], mode });
      expect(badania(st), mode).toEqual({ pracownia: true, zbadane: 1, era: 6, koncowa: false, siecWlaczona: false });
    }
  });

  it('fabryka bieżącego trybu zbadana: koncowa true; fabryka drugiego trybu w techDone nie daje celu', () => {
    const zFabryka = (mode: GameMode, fabryka: string) =>
      badania(gra({ pracownia: true, techDone: ['t_siec', fabryka], mode }).st);
    expect(zFabryka('zwykly', 't_fabryka_bio')).toEqual({
      pracownia: true,
      zbadane: 2,
      era: 6,
      koncowa: true,
      siecWlaczona: false,
    });
    expect(zFabryka('zwykly', 't_fabryka_hum')).toMatchObject({ zbadane: 2, era: 6, koncowa: false });
    expect(zFabryka('zombie', 't_fabryka_hum')).toMatchObject({ zbadane: 2, era: 6, koncowa: true });
    expect(zFabryka('zombie', 't_fabryka_bio')).toMatchObject({ zbadane: 2, era: 6, koncowa: false });
  });

  it('odczyt tylko czyta: nie tworzy pól w stanie', () => {
    const { st } = gra({ pracownia: true, techDone: ['t_siec'] });
    const przed = JSON.stringify(st);
    badania(st);
    expect(JSON.stringify(st)).toBe(przed);
  });
});

describe('polecenie siec', () => {
  it('bez zbadanej sieci nic nie robi i nie tworzy pola, nawet przy stojącej pracowni', () => {
    const { st, sim } = gra({ pracownia: true, techDone: ['t_okna'] });
    const kontrolna = gra({ pracownia: true, techDone: ['t_okna'] });
    siec(sim);
    kontrolna.sim.step();
    expect(st.research).toBeUndefined();
    expect(siecWlaczona(st)).toBe(false);
    expect(badania(st)?.siecWlaczona).toBe(false);
    expect(sim.hash()).toBe(kontrolna.sim.hash());
  });

  it('bez pracowni nic nie robi, choć sieć jest zbadana', () => {
    const { st, sim } = gra({ techDone: ['t_siec'] });
    const kontrolna = gra({ techDone: ['t_siec'] });
    siec(sim);
    kontrolna.sim.step();
    expect(st.research).toBeUndefined();
    expect(siecWlaczona(st)).toBe(false);
    expect(sim.hash()).toBe(kontrolna.sim.hash());
  });

  it('z samą t_siec (bez fabryki) i pracownią włącza sieć, a odczyt dla zarządu to widzi', () => {
    const { st, sim } = gra({ pracownia: true, techDone: ['t_siec'] });
    expect(siecWlaczona(st)).toBe(false);
    siec(sim);
    expect(siecWlaczona(st)).toBe(true);
    expect(st.research?.siec).toBe(true);
    expect(badania(st)).toEqual({ pracownia: true, zbadane: 1, era: 6, koncowa: false, siecWlaczona: true });
  });

  it('nie potrzebuje zaznaczonych osób ani nie rusza badania w toku', () => {
    const { st, sim } = gra({ pracownia: true, techDone: ['t_siec', 't_okna'] });
    st.research = { cur: 't_kozy', prog: { t_kozy: 3 }, at: { t_okna: 1 } };
    sim.push({ t: 'siec', ids: [] });
    sim.step();
    expect(st.research).toEqual({ cur: 't_kozy', prog: { t_kozy: 3 }, at: { t_okna: 1 }, siec: true });
  });

  it('drugie polecenie nie zmienia skrótu stanu', () => {
    const raz = gra({ pracownia: true, techDone: ['t_siec'] });
    const dwa = gra({ pracownia: true, techDone: ['t_siec'] });
    raz.sim.push({ t: 'siec', ids: [] });
    dwa.sim.push({ t: 'siec', ids: [] });
    dwa.sim.push({ t: 'siec', ids: [] });
    raz.sim.step();
    dwa.sim.step();
    expect(siecWlaczona(dwa.st)).toBe(true);
    expect(dwa.sim.hash()).toBe(raz.sim.hash());
    // także w osobnym kroku, kilka kroków później
    for (let k = 0; k < 5; k++) {
      raz.sim.step();
      dwa.sim.step();
    }
    siec(dwa.sim);
    raz.sim.step();
    expect(dwa.sim.hash()).toBe(raz.sim.hash());
  });

  it('rozbiórka pracowni po włączeniu nie wyłącza sieci', () => {
    const { st, sim, prac } = gra({ pracownia: true, techDone: ['t_siec'] });
    siec(sim);
    st.things.splice(st.things.indexOf(prac!), 1);
    expect(siecWlaczona(st)).toBe(true);
    expect(badania(st)).toMatchObject({ pracownia: false, siecWlaczona: true });
  });
});

describe('stan bez włączenia sieci', () => {
  it('świeży stan i new Sim nie mają nowego pola ani stanu badań', () => {
    const st = createSim(w, seed, { core: 4 });
    expect(st.research).toBeUndefined();
    expect(JSON.stringify(st)).not.toContain('siec');
    const sim = new Sim(w, st);
    expect(st.research).toBeUndefined();
    expect(JSON.stringify(sim.st)).not.toContain('siec');
    expect(siecWlaczona(st)).toBe(false);
  });

  it('zwykłe badanie (research) nie dopisuje pola sieci', () => {
    const { st, sim } = gra({ pracownia: true });
    sim.push({ t: 'research', ids: [], tech: 't_okna' });
    sim.step();
    expect(st.research?.cur).toBe('t_okna');
    expect(st.research).not.toHaveProperty('siec');
  });
});

describe('menu pracowni: Włączyć sieć', () => {
  it('pozycji nie ma bez zbadanej sieci', () => {
    const { st, prac } = gra({ pracownia: true, techDone: ['t_okna'] });
    expect(pozycja(st, kafel(prac!))).toBeUndefined();
  });

  it('po zbadaniu sieci (bez fabryki) jest na pracowni, na obu jej kafelkach, i wysyła polecenie siec', () => {
    const { st, sim, prac } = gra({ pracownia: true, techDone: ['t_siec'] });
    const m = pozycja(st, kafel(prac!))!;
    expect(m).toBeTruthy();
    expect(m.label).toBe('Włączyć sieć');
    expect(m.quick).toBe(false);
    // nieodwracalne i zaczyna epilog: z potwierdzeniem, nigdy od stuknięcia
    expect(m.confirm).toBe(true);
    expect(m.cmd).toEqual({ t: 'siec', ids: rdzen(st) });
    expect(pozycja(st, kafel(prac!) + (prac!.w - 1))).toBeTruthy();
    // wybrana pozycja naprawdę włącza sieć
    sim.push(m.cmd);
    sim.step();
    expect(siecWlaczona(st)).toBe(true);
  });

  it('po angielsku „Switch on the grid”', () => {
    const { st, prac } = gra({ pracownia: true, techDone: ['t_siec'] });
    ustawJezyk('en');
    expect(pozycja(st, kafel(prac!))?.label).toBe('Switch on the grid');
  });

  it('nie ma jej poza pracownią ani bez zaznaczonej osoby z zarządu', () => {
    const { st, prac } = gra({ pracownia: true, techDone: ['t_siec'] });
    expect(pozycja(st, kafel(prac!) + w.size * 3)).toBeUndefined();
    expect(commandsAt(st, w, [], kafel(prac!))).toEqual([]);
  });

  it('okno potwierdzenia: pytanie i ostrzeżenie w obu językach, przyciski jak w każdym potwierdzeniu', () => {
    const pl = siecSheet();
    expect(pl.title).toBe('Włączyć sieć bez miedzi?');
    expect(pl.body).toContain('Tej nocy zapalą się okna w całym terenie.');
    expect(pl.body).toContain('Tego nie da się cofnąć.');
    expect(pl.foot).toContain('data-act="confirm-yes"');
    expect(pl.foot).toContain('data-act="confirm-no"');
    ustawJezyk('en');
    const en = siecSheet();
    expect(en.title).toBe('Switch on the copper-free grid?');
    expect(en.body).toContain('Tonight every window on your ground will light up.');
    expect(en.body).toContain('This cannot be undone.');
    expect(`${en.kicker}${en.title}${en.body}${en.foot}`).not.toMatch(/[ąćęłńóśźż]/i);
  });

  it('znika po włączeniu sieci', () => {
    const { st, sim, prac } = gra({ pracownia: true, techDone: ['t_siec'] });
    siec(sim);
    expect(pozycja(st, kafel(prac!))).toBeUndefined();
  });
});
